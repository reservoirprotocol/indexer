/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { fromBuffer, regex, toBuffer } from "@/common/utils";
import { CollectionSets } from "@/models/collection-sets";
import { getJoiPriceObject, JoiPrice } from "@/common/joi";
import * as Sdk from "@reservoir0x/sdk";
import { config } from "@/config/index";

const version = "v2";

export const getOwnersV2Options: RouteOptions = {
  cache: {
    privacy: "public",
    expiresIn: 60 * 60 * 1000,
  },
  description: "Owners",
  notes:
    "Get owners with various filters applied, and a summary of their ownership. Useful for exploring top owners in a collection or attribute.",
  tags: ["api", "Owners"],
  plugins: {
    "hapi-swagger": {
      order: 6,
    },
  },
  validate: {
    query: Joi.object({
      collectionsSetId: Joi.string()
        .lowercase()
        .description(
          "Filter to a particular collection set id. Example: `8daa732ebe5db23f267e58d52f1c9b1879279bcdf4f78b8fb563390e6946ea65`"
        ),
      collection: Joi.string()
        .lowercase()
        .description(
          "Filter to a particular collection with collection-id. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
      contract: Joi.string()
        .lowercase()
        .pattern(/^0x[a-fA-F0-9]{40}$/)
        .description(
          "Filter to a particular contract. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
      token: Joi.string()
        .lowercase()
        .pattern(/^0x[a-fA-F0-9]{40}:[0-9]+$/)
        .description(
          "Filter to a particular token. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:123`"
        ),
      attributes: Joi.object()
        .unknown()
        .description(
          "Filter to a particular attribute. Attributes are case sensitive. Note: Our docs do not support this parameter correctly. To test, you can use the following URL in your browser. Example: `https://api.reservoir.tools/owners/v1?collection=0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63&attribute[Type]=Original` or `https://api.reservoir.tools/owners/v1?collection=0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63&attribute[Type]=Original&attribute[Type]=Sibling`"
        ),
      offset: Joi.number()
        .integer()
        .min(0)
        .default(0)
        .description("Use offset to request the next batch of items."),
      limit: Joi.number()
        .integer()
        .min(1)
        .max(500)
        .default(20)
        .description("Amount of items returned in response. Max limit is 500."),
      displayCurrency: Joi.string()
        .lowercase()
        .pattern(regex.address)
        .description("Input any ERC20 address to return result in given currency"),
    })
      .oxor("collectionsSetId", "collection", "contract", "token")
      .or("collectionsSetId", "collection", "contract", "token")
      .without("attributes", ["token", "contract"]),
  },
  response: {
    schema: Joi.object({
      owners: Joi.array().items(
        Joi.object({
          address: Joi.string(),
          ownership: Joi.object({
            tokenCount: Joi.string(),
            onSaleCount: Joi.string(),
            floorAskPrice: JoiPrice.allow(null).description(
              "Can return `null` if there is no Floor Ask"
            ),
            topBidValue: JoiPrice.allow(null).description("Can return `null` if there are no bids"),
            totalBidValue: JoiPrice.allow(null).description(
              "Can return `null` if there are no bids"
            ),
          }),
        })
      ),
    }).label(`getOwners${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-owners-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    let nftBalancesFilter = "";
    let tokensFilter = "";
    let attributesJoin = "";
    let tokensJoin = "";

    if (query.collection) {
      if (query.attributes) {
        const attributes: { key: string; value: string }[] = [];
        Object.entries(query.attributes).forEach(([key, values]) => {
          (Array.isArray(values) ? values : [values]).forEach((value) =>
            attributes.push({ key, value })
          );
        });

        for (let i = 0; i < attributes.length; i++) {
          (query as any)[`key${i}`] = attributes[i].key;
          (query as any)[`value${i}`] = attributes[i].value;
          attributesJoin += `
            JOIN token_attributes ta${i}
              ON nft_balances.contract = ta${i}.contract
              AND nft_balances.token_id = ta${i}.token_id
              AND ta${i}.key = $/key${i}/
              AND ta${i}.value = $/value${i}/
          `;
        }
      }

      // Check if the collection passed is identical the contract
      if (query.collection.match(/^0x[a-f0-9]{40}:\d+:\d+$/g)) {
        // This is a range collection
        const [contract, startTokenId, endTokenId] = query.collection.split(":");
        (query as any).contract = toBuffer(contract);
        (query as any).startTokenId = startTokenId;
        (query as any).endTokenId = endTokenId;

        nftBalancesFilter = `nft_balances.contract = $/contract/ AND nft_balances.token_id BETWEEN $/startTokenId/ AND $/endTokenId/`;
        tokensFilter = `tokens.contract = $/contract/ AND tokens.token_id BETWEEN $/startTokenId/ AND $/endTokenId/`;
      } else if (query.collection.match(/^0x[a-f0-9]{40}:[a-zA-Z]+-.+$/g)) {
        const [contract] = query.collection.split(":");

        (query as any).contract = toBuffer(contract);

        tokensJoin = `JOIN tokens ON nft_balances.contract = tokens.contract AND nft_balances.token_id = tokens.token_id`;

        nftBalancesFilter = `nft_balances.contract = $/contract/ AND tokens.contract = $/contract/ AND tokens.collection_id = $/collection/`;
        tokensFilter = `tokens.contract = $/contract/ AND tokens.collection_id = $/collection/`;
      } else {
        (query as any).contract = toBuffer(query.collection);

        nftBalancesFilter = `nft_balances.contract = $/contract/`;
        tokensFilter = `tokens.contract = $/contract/`;
      }
    } else if (query.contract) {
      (query as any).contract = toBuffer(query.contract);
      nftBalancesFilter = `nft_balances.contract = $/contract/`;
      tokensFilter = `tokens.contract = $/contract/`;
    } else if (query.token) {
      const [contract, tokenId] = query.token.split(":");

      (query as any).contract = toBuffer(contract);
      (query as any).tokenId = tokenId;
      nftBalancesFilter = `nft_balances.contract = $/contract/ AND nft_balances.token_id = $/tokenId/`;
      tokensFilter = `tokens.contract = $/contract/ AND tokens.token_id = $/tokenId/`;
    } else if (query.collectionsSetId) {
      let i = 0;
      const addCollectionToFilter = (id: string) => {
        ++i;
        (query as any)[`contract${i}`] = toBuffer(id);
        nftBalancesFilter = `${nftBalancesFilter}$/contract${i}/, `;
        tokensFilter = `${tokensFilter}$/contract${i}/, `;
      };

      await CollectionSets.getCollectionsIds(query.collectionsSetId).then((result) =>
        result.forEach(addCollectionToFilter)
      );
      if (!nftBalancesFilter && !tokensFilter) {
        return { owners: [] };
      }
      nftBalancesFilter = `nft_balances.contract IN (${nftBalancesFilter.substring(
        0,
        nftBalancesFilter.lastIndexOf(", ")
      )})`;
      tokensFilter = `tokens.contract IN (${tokensFilter.substring(
        0,
        tokensFilter.lastIndexOf(", ")
      )})`;
    }

    try {
      const baseQuery = `
        WITH x AS (
          SELECT owner, SUM(amount) AS token_count
          FROM nft_balances
          ${tokensJoin}
          ${attributesJoin}
          WHERE ${nftBalancesFilter}
          AND amount > 0
          GROUP BY owner
          ORDER BY token_count DESC, owner
          OFFSET ${query.offset} LIMIT ${query.limit}
        )
        SELECT 
          nft_balances.owner,
          SUM(nft_balances.amount) AS token_count,
          COUNT(*) FILTER (WHERE tokens.floor_sell_value IS NOT NULL) AS on_sale_count,
          MIN(tokens.floor_sell_value) AS floor_sell_value,
          MAX(tokens.top_buy_value) AS top_buy_value,
          SUM(nft_balances.amount) * MAX(tokens.top_buy_value) AS total_buy_value
        FROM nft_balances
        JOIN tokens ON nft_balances.contract = tokens.contract AND nft_balances.token_id = tokens.token_id
        ${attributesJoin}
        WHERE ${tokensFilter}
        AND nft_balances.owner IN (SELECT owner FROM x)
        AND nft_balances.amount > 0
        GROUP BY nft_balances.owner
        ORDER BY token_count DESC, nft_balances.owner
      `;

      const result = await redb.manyOrNone(baseQuery, query).then((result) =>
        result.map(async (r) => ({
          address: fromBuffer(r.owner),
          ownership: {
            tokenCount: String(r.token_count),
            onSaleCount: String(r.on_sale_count),
            floorAskPrice: r.floor_sell_value
              ? await getJoiPriceObject(
                  {
                    gross: {
                      amount: String(r.floor_sell_value),
                      nativeAmount: String(r.floor_sell_value),
                    },
                  },
                  Sdk.Common.Addresses.Native[config.chainId],
                  query.displayCurrency
                )
              : null,
            topBidValue: r.top_buy_value
              ? await getJoiPriceObject(
                  {
                    gross: {
                      amount: String(r.top_buy_value),
                      nativeAmount: String(r.top_buy_value),
                    },
                  },
                  Sdk.Common.Addresses.Native[config.chainId],
                  query.displayCurrency
                )
              : null,
            totalBidValue: r.total_buy_value
              ? await getJoiPriceObject(
                  {
                    gross: {
                      amount: String(r.total_buy_value),
                      nativeAmount: String(r.total_buy_value),
                    },
                  },
                  Sdk.Common.Addresses.Native[config.chainId],
                  query.displayCurrency
                )
              : null,
          },
        }))
      );

      return { owners: await Promise.all(result) };
    } catch (error) {
      logger.error(`get-owners-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
