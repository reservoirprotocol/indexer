/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import Joi from "joi";

import _ from "lodash";
import { idb, pgp } from "@/common/db";
import PgPromise from "pg-promise";
import { baseProvider } from "@/common/provider";
import { toBuffer } from "@/common/utils";
import * as allOrderHandlers from "@/orderbook/orders";
import * as erc721c from "@/utils/erc721c";
import { logger } from "@/common/logger";

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
          $/collection/
        ) 
        ON CONFLICT DO NOTHING RETURNING 1
      `,
      {
        contract: toBuffer(contract),
        collection: contract,
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
          $/id/,
          $/name/,
          $/slug/,
          $/contract/
        ) 
        ON CONFLICT DO NOTHING RETURNING 1
      `,
      {
        id: contract,
        contract: toBuffer(contract),
        name: "test",
        slug: contract,
      }
    );

    if (balanceResult) {
      await idb.oneOrNone(
        `
          UPDATE nft_balances 
            SET amount = $/amount/, updated_at = now()
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
  try {
    await erc721c.v2.refreshConfig(address);
  } catch (error) {
    logger.error(`refreshERC721CV2Config`, `${error}`);
  }

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
        contract: toBuffer(address),
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

async function mockTokenAttributes(
  collection: string,
  contract: string,
  tokenId: string,
  attributes: {
    key: string;
    value: string;
    kind: string;
    rank: string;
  }[]
) {
  // Fetch all existing keys
  const addedTokenAttributes = [];
  const attributeIds = [];
  const attributeKeysIds = await idb.manyOrNone(
    `
      SELECT key, id, info
      FROM attribute_keys
      WHERE collection_id = $/collection/
      AND key IN ('${_.join(
        _.map(attributes, (a) => PgPromise.as.value(a.key)),
        "','"
      )}')
    `,
    { collection }
  );

  const attributeKeysIdsMap = new Map(
    _.map(attributeKeysIds, (a) => [a.key, { id: a.id, info: a.info }])
  );

  // Token attributes
  for (const { key, value, kind, rank } of attributes) {
    if (
      attributeKeysIdsMap.has(key) &&
      kind == "number" &&
      (_.isNull(attributeKeysIdsMap.get(key)?.info) ||
        attributeKeysIdsMap.get(key)?.info.min_range > value ||
        attributeKeysIdsMap.get(key)?.info.max_range < value)
    ) {
      // If number type try to update range as well and return the ID
      const infoUpdate = `
        CASE WHEN info IS NULL THEN 
          jsonb_object(array['min_range', 'max_range'], array[$/value/, $/value/]::text[])
          ELSE
            info || jsonb_object(array['min_range', 'max_range'], array[
              CASE
                WHEN (info->>'min_range')::numeric > $/value/::numeric THEN $/value/::numeric
                ELSE (info->>'min_range')::numeric
              END,
              CASE
                WHEN (info->>'max_range')::numeric < $/value/::numeric THEN $/value/::numeric
                ELSE (info->>'max_range')::numeric
              END
            ]::text[])
        END
      `;

      await idb.oneOrNone(
        `
              UPDATE attribute_keys
              SET info = ${infoUpdate}
              WHERE collection_id = $/collection/
              AND key = $/key/
            `,
        {
          collection,
          key: String(key),
          value,
        }
      );
    }

    // This is a new key, insert it and return the ID
    if (!attributeKeysIdsMap.has(key)) {
      let info = null;
      if (kind == "number") {
        info = { min_range: Number(value), max_range: Number(value) };
      }

      // If no attribute key is available, then save it and refetch
      const attributeKeyResult = await idb.oneOrNone(
        `
          INSERT INTO "attribute_keys" (
            "collection_id",
            "key",
            "kind",
            "rank",
            "info"
          ) VALUES (
            $/collection/,
            $/key/,
            $/kind/,
            $/rank/,
            $/info/
          )
          ON CONFLICT DO NOTHING
          RETURNING "id"
        `,
        {
          collection,
          key: String(key),
          kind,
          rank: rank || null,
          info,
        }
      );

      if (!attributeKeyResult?.id) {
        // Otherwise, fail (and retry)
        throw new Error(`Could not fetch/save attribute key "${key}"`);
      }

      // Add the new key and id to the map
      attributeKeysIdsMap.set(key, { id: attributeKeyResult.id, info });
    }

    // Fetch the attribute from the database (will succeed in the common case)
    let attributeResult = await idb.oneOrNone(
      `
            SELECT id, COALESCE(array_length(sample_images, 1), 0) AS "sample_images_length"
            FROM attributes
            WHERE attribute_key_id = $/attributeKeyId/
            AND value = $/value/
          `,
      {
        attributeKeyId: attributeKeysIdsMap.get(key)?.id,
        value: String(value),
      }
    );

    if (!attributeResult?.id) {
      // If no attribute is not available, then save it and refetch
      attributeResult = await idb.oneOrNone(
        `
          WITH "x" AS (
            INSERT INTO "attributes" (
              "attribute_key_id",
              "value",
              "sell_updated_at",
              "buy_updated_at",
              "collection_id",
              "kind",
              "key"
            ) VALUES (
              $/attributeKeyId/,
              $/value/,
              NOW(),
              NOW(),
              $/collection/,
              $/kind/,
              $/key/
            )
            ON CONFLICT DO NOTHING
            RETURNING "id"
          )
          
          UPDATE attribute_keys
          SET attribute_count = "attribute_count" + (SELECT COUNT(*) FROM "x")
          WHERE id = $/attributeKeyId/
          RETURNING (SELECT x.id FROM "x"), "attribute_count"
        `,
        {
          attributeKeyId: attributeKeysIdsMap.get(key)?.id,
          value: String(value),
          collection,
          kind,
          key: String(key),
        }
      );
    }

    if (!attributeResult?.id) {
      // Otherwise, fail (and retry)
      throw new Error(
        `Could not fetch/save attribute keyId ${
          attributeKeysIdsMap.get(key)?.id
        } key ${key} value ${value} attributeResult ${JSON.stringify(attributeResult)}`
      );
    }

    attributeIds.push(attributeResult.id);

    // Associate the attribute with the token
    const tokenAttributeResult = await idb.oneOrNone(
      `
            INSERT INTO "token_attributes" (
              "contract",
              "token_id",
              "attribute_id",
              "collection_id",
              "key",
              "value"
            ) VALUES (
              $/contract/,
              $/tokenId/,
              $/attributeId/,
              $/collection/,
              $/key/,
              $/value/
            )
            ON CONFLICT DO NOTHING
            RETURNING key, value, attribute_id;
          `,
      {
        contract: toBuffer(contract),
        tokenId,
        attributeId: attributeResult.id,
        image: null,
        collection,
        key: String(key),
        value: String(value),
      }
    );

    if (tokenAttributeResult) {
      addedTokenAttributes.push(tokenAttributeResult);
    }
  }

  let attributeIdsFilter = "";

  if (attributeIds.length) {
    attributeIdsFilter = `AND attribute_id NOT IN ($/attributeIds:raw/)`;
  }

  // Clear deleted token attributes
  await idb.manyOrNone(
    `WITH x AS (
                  DELETE FROM token_attributes
                  WHERE contract = $/contract/
                  AND token_id = $/tokenId/
                  ${attributeIdsFilter}
                  RETURNING contract, token_id, attribute_id, collection_id, key, value, created_at
                 )
                 INSERT INTO removed_token_attributes SELECT * FROM x
                 ON CONFLICT (contract,token_id,attribute_id) DO UPDATE SET deleted_at = now()
                 RETURNING key, value, attribute_id;`,
    {
      contract: toBuffer(contract),
      tokenId,
      attributeIds: _.join(attributeIds, ","),
    }
  );
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
            attributes: Joi.array()
              .items(
                Joi.object({
                  key: Joi.string(),
                  value: Joi.string(),
                  kind: Joi.string(),
                  rank: Joi.number(),
                })
              )
              .optional(),
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
      try {
        await refreshNFTBalance(nft.owner, nft.collection.toLowerCase(), nft.tokenId);
        if (nft.attributes) {
          await mockTokenAttributes(
            nft.collection.toLowerCase(),
            nft.collection.toLowerCase(),
            nft.tokenId,
            nft.attributes
          );
        }
      } catch {
        // Skip errors
      }
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
