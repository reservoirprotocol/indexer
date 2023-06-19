/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { toBuffer } from "@/common/utils";
import { CollectionSets } from "@/models/collection-sets";

const version = "v1";

export const getCollectionsSetOwnersDistributionV1Options: RouteOptions = {
  description: "Owners Collection Set Distribution",
  notes:
    "This API can be used to show what the distribution of owners in a collections set id looks like.",
  tags: ["api", "Owners"],
  plugins: {
    "hapi-swagger": {
      order: 6,
    },
  },
  validate: {
    params: Joi.object({
      collectionsSetId: Joi.string()
        .lowercase()
        .required()
        .description(
          "Filter to a particular collections set. Example: `8daa732ebe5db23f267e58d52f1c9b1879279bcdf4f78b8fb563390e6946ea65`"
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
            .description("The amount of owners with the same `tokenCount`."),
        })
      ),
    }).label(`getCollectionsSetOwnersDistribution${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(
        `get-collections-set-owners-distribution-${version}-handler`,
        `Wrong response schema: ${error}`
      );
      throw error;
    },
  },
  handler: async (request: Request) => {
    const params = request.params as any;

    try {
      let collectionFilter = "";

      let i = 0;
      const addCollectionToFilter = (id: string) => {
        ++i;
        (params as any)[`contract${i}`] = toBuffer(id);
        collectionFilter = `${collectionFilter}$/contract${i}/, `;
      };

      await CollectionSets.getCollectionsIds(params.collectionsSetId).then((result) =>
        result.forEach(addCollectionToFilter)
      );

      if (!collectionFilter) {
        return { ownersDistribution: [] };
      }

      collectionFilter = `nft_balances.contract IN (${collectionFilter.substring(
        0,
        collectionFilter.lastIndexOf(", ")
      )})`;

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
        `get-collections-set-owners-distribution-${version}-handler`,
        `Handler failure: ${error}`
      );
      throw error;
    }
  },
};
