/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import Joi from "joi";

import { idb, pgp } from "@/common/db";
import { baseProvider } from "@/common/provider";
import { toBuffer } from "@/common/utils";
import * as allOrderHandlers from "@/orderbook/orders";

async function refreshBalance(owner: string, contract: string) {
  const balanceResult = await idb.oneOrNone(
    `
      SELECT ft_balances.amount FROM ft_balances
      WHERE ft_balances.contract = $/contract/
        AND ft_balances.owner = $/owner/
    `,
    {
      contract: toBuffer(contract),
      owner: toBuffer(owner),
    }
  );

  try {
    const currency = new Sdk.Common.Helpers.Erc20(baseProvider, contract);
    const currencyBalance = await currency.getBalance(owner);
    if (balanceResult) {
      await idb.oneOrNone(
        `
          UPDATE ft_balances 
            SET amount = $/amount/
          WHERE contract = $/contract/
            AND owner = $/owner/
        `,
        {
          contract: toBuffer(contract),
          owner: toBuffer(owner),
          amount: currencyBalance.toString(),
        }
      );
    } else {
      await idb.oneOrNone(
        `
          INSERT INTO ft_balances(
            amount,
            contract,
            owner
          ) VALUES (
            $/amount/,
            $/contract/,
            $/owner/
          ) ON CONFLICT DO NOTHING RETURNING 1
        `,
        {
          contract: toBuffer(contract),
          owner: toBuffer(owner),
          amount: currencyBalance.toString(),
        }
      );
    }
  } catch {
    // Skip errors
  }
}

async function refreshNFTBalance(owner: string, contract: string, tokenId: string) {
  const balanceResult = await idb.oneOrNone(
    `
      SELECT nft_balances.amount FROM nft_balances
      WHERE nft_balances.contract = $/contract/
        AND nft_balances.token_id = $/tokenId/
        AND nft_balances.owner = $/owner/
    `,
    {
      contract: toBuffer(contract),
      tokenId,
      owner: toBuffer(owner),
    }
  );

  try {
    const nft = new Sdk.Common.Helpers.Erc721(baseProvider, contract);
    const tokenOwner = await nft.getOwner(tokenId);
    const isSame = tokenOwner.toLowerCase() === owner.toLowerCase();

    await idb.oneOrNone(
      `
        INSERT INTO tokens(
          contract,
          token_id,
          minted_timestamp,
          collection_id
        ) VALUES (
          $/contract/,
          $/tokenId/,
          $/mintedTimestamp/,
          $/contract/
        ) 
        ON CONFLICT DO NOTHING RETURNING 1
      `,
      {
        contract: toBuffer(contract),
        tokenId,
        mintedTimestamp: Math.floor(Date.now() / 1000),
      }
    );

    await idb.oneOrNone(
      `
        INSERT INTO collections(
          id,
          name,
          slug,
          contract
        ) VALUES (
          $/contract/,
          $/name/,
          $/slug/,
          $/contract/
        ) 
        ON CONFLICT DO NOTHING RETURNING 1
      `,
      {
        contract: toBuffer(contract),
        name: "test",
        slug: contract,
      }
    );

    if (balanceResult) {
      await idb.oneOrNone(
        `
          UPDATE nft_balances 
            SET amount = $/amount/
          WHERE contract = $/contract/
            AND owner = $/owner/
            AND token_id = $/tokenId/
        `,
        {
          contract: toBuffer(contract),
          owner: toBuffer(owner),
          tokenId,
          amount: isSame ? 1 : 0,
        }
      );
    } else {
      await idb.oneOrNone(
        `
          INSERT INTO nft_balances(
            amount,
            contract,
            owner,
            token_id
          ) VALUES (
            $/amount/,
            $/contract/,
            $/owner/,
            $/tokenId/
          ) ON CONFLICT DO NOTHING RETURNING 1
        `,
        {
          contract: toBuffer(contract),
          owner: toBuffer(owner),
          tokenId,
          amount: isSame ? 1 : 0,
        }
      );
    }
  } catch {
    // Skip errors
  }
}

export async function saveContract(address: string, kind: string) {
  const columns = new pgp.helpers.ColumnSet(["address", "kind"], {
    table: "contracts",
  });

  const queries = [
    `INSERT INTO "contracts" (
        "address",
        "kind"
      ) VALUES ${pgp.helpers.values(
        {
          address: toBuffer(address),
          kind,
        },
        columns
      )}
      ON CONFLICT DO NOTHING
    `,
    `
    INSERT INTO "collections" (
      "id",
      "token_count",
      "slug",
      "name",
      "contract"
    ) VALUES ${pgp.helpers.values(
      {
        id: address,
        token_count: 10000,
        slug: address,
        name: "Mock Name",
        contract: address,
      },
      new pgp.helpers.ColumnSet(["id", "token_count", "slug", "name", "contract"], {
        table: "collections",
      })
    )}
    ON CONFLICT DO NOTHING
    `,
  ];

  await idb.none(pgp.helpers.concat(queries));
}

export const orderSavingOptions: RouteOptions = {
  description: "Order saving",
  tags: ["debug"],
  plugins: {
    "hapi-swagger": {
      deprecated: true,
    },
  },
  validate: {
    payload: Joi.object({
      contract: Joi.string().optional(),
      kind: Joi.string().optional(),
      currency: Joi.string().default(null).optional(),
      makers: Joi.array().items(Joi.string()).default([]).optional(),
      nfts: Joi.array()
        .items(
          Joi.object({
            collection: Joi.string(),
            tokenId: Joi.string(),
            owner: Joi.string(),
          })
        )
        .default([])
        .optional(),
      orders: Joi.array().items(
        Joi.object({
          kind: Joi.string(),
          data: Joi.object().required(),
          originatedAt: Joi.string(),
        })
      ),
    }),
  },
  handler: async (request: Request) => {
    const payload = request.payload as any;
    const orders = payload.orders;
    const results: any[] = [];
    const currency = payload.currency;
    const makers = payload.makers;
    const nfts = payload.nfts;

    if (currency) {
      // Refresh FT balance
      for (let index = 0; index < makers.length; index++) {
        const maker = makers[index];
        await refreshBalance(maker, currency);
      }
    }

    // Refresh NFT balance
    for (let index = 0; index < nfts.length; index++) {
      const nft = nfts[index];
      await refreshNFTBalance(nft.owner, nft.collection.toLowerCase(), nft.tokenId);
    }

    // Store contract
    if (payload.contract) {
      await saveContract(payload.contract.toLowerCase(), payload.kind);
    }

    // Save order
    for (const { kind, data, originatedAt } of orders) {
      const handler = (allOrderHandlers as any)[kind];
      try {
        const result = await handler.save([
          {
            orderParams: data,
            metadata: {
              originatedAt,
            },
          },
        ]);
        results.push(result[0]);
      } catch (error) {
        results.push({ error });
      }
    }

    return results;
  },
};
