/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { formatEth, fromBuffer, toBuffer } from "@/common/utils";

const version = "v1";

export const getOwnersV1Options: RouteOptions = {
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
      collection: Joi.string()
        .lowercase()
        .pattern(/^0x[a-fA-F0-9]{40}:[0-9]+:[0-9]+$|^0x[a-fA-F0-9]{40}$/)
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
        .description("Filter to a particular attribute. Example: `attributes[Type]=Original`"),
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
        .description("Amount of items returned in response."),
    })
      .oxor("collection", "contract", "token")
      .or("collection", "contract", "token")
      .with("attributes", "collection"),
  },
  response: {
    schema: Joi.object({
      owners: Joi.array().items(
        Joi.object({
          address: Joi.string(),
          ownership: Joi.object({
            tokenCount: Joi.string(),
            onSaleCount: Joi.string(),
            floorAskPrice: Joi.number().unsafe().allow(null),
            topBidValue: Joi.number().unsafe().allow(null),
            totalBidValue: Joi.number().unsafe().allow(null),
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

      // If the collection passed is identical the contract
      if (/^0x[a-f0-9]{40}$/.test(query.collection)) {
        (query as any).contract = toBuffer(query.collection);

        nftBalancesFilter = `nft_balances.contract = $/contract/`;
        tokensFilter = `tokens.contract = $/contract/`;
      } else {
        // This is a range collection
        const [contract, startTokenId, endTokenId] = query.collection.split(":");
        (query as any).contract = toBuffer(contract);
        (query as any).startTokenId = startTokenId;
        (query as any).endTokenId = endTokenId;

        nftBalancesFilter = `nft_balances.contract = $/contract/ AND nft_balances.token_id BETWEEN $/startTokenId/ AND $/endTokenId/`;
        tokensFilter = `tokens.contract = $/contract/ AND tokens.token_id BETWEEN $/startTokenId/ AND $/endTokenId/`;
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
    }

    try {
      const baseQuery = `
        WITH x AS (
          SELECT owner, SUM(amount) AS token_count
          FROM nft_balances
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
        result.map((r) => ({
          address: fromBuffer(r.owner),
          ownership: {
            tokenCount: String(r.token_count),
            onSaleCount: String(r.on_sale_count),
            floorAskPrice: r.floor_sell_value ? formatEth(r.floor_sell_value) : null,
            topBidValue: r.top_buy_value ? formatEth(r.top_buy_value) : null,
            totalBidValue: r.total_buy_value ? formatEth(r.total_buy_value) : null,
          },
        }))
      );

      return { owners: result };
    } catch (error) {
      logger.error(`get-owners-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
