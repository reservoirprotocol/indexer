/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { toBuffer } from "@/common/utils";

const version = "v1";

export const getCollectionOwnersDistributionV1Options: RouteOptions = {
  description: "Owners Collection Distribution",
  notes: "This API can be used to show what the distribution of owners in a collection looks like.",
  tags: ["api", "Owners"],
  plugins: {
    "hapi-swagger": {
      order: 6,
    },
  },
  validate: {
    params: Joi.object({
      collection: Joi.string()
        .lowercase()
        .required()
        .description(
          "Filter to a particular collection with collection-id. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
    }),
  },
  response: {
    schema: Joi.object({
      ownersDistribution: Joi.array().items(
        Joi.object({
          tokenCount: Joi.number().unsafe(),
          ownerCount: Joi.number()
            .unsafe()
            .description("The amount of owners that have the same `tokenCount`."),
        })
      ),
    }).label(`getCollectionOwnersDistribution${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(
        `get-collection-owners-distribution-${version}-handler`,
        `Wrong response schema: ${error}`
      );
      throw error;
    },
  },
  handler: async (request: Request) => {
    const params = request.params as any;

    try {
      let collectionFilter = "";

      if (params.collection.match(/^0x[a-f0-9]{40}:\d+:\d+$/g)) {
        const [contract, startTokenId, endTokenId] = params.collection.split(":");

        (params as any).contract = toBuffer(contract);
        (params as any).startTokenId = startTokenId;
        (params as any).endTokenId = endTokenId;
        collectionFilter = `
          nft_balances.contract = $/contract/
          AND nft_balances.token_id >= $/startTokenId/
          AND nft_balances.token_id <= $/endTokenId/
        `;
      } else {
        (params as any).contract = toBuffer(params.collection);
        collectionFilter = `nft_balances.contract = $/contract/`;
      }

      const baseQuery = `
        WITH owners AS (
          SELECT nft_balances.owner, SUM(nft_balances.amount) AS token_count
          FROM nft_balances
          WHERE ${collectionFilter} AND nft_balances.amount > 0
          GROUP BY nft_balances.owner
        )
        
        SELECT owners.token_count, COUNT(*) AS owner_count
        FROM owners
        GROUP BY owners.token_count
        ORDER BY owners.token_count
      `;

      const result = await redb.manyOrNone(baseQuery, params).then((result) =>
        result.map((r) => ({
          tokenCount: Number(r.token_count),
          ownerCount: Number(r.owner_count),
        }))
      );

      return { ownersDistribution: result };
    } catch (error) {
      logger.error(
        `get-collection-owners-distribution-${version}-handler`,
        `Handler failure: ${error}`
      );
      throw error;
    }
  },
};
