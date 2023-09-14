/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { fromBuffer } from "@/common/utils";
import _ from "lodash";

const version = "v1";

export const getCrossCollectionsOwnersV1Options: RouteOptions = {
  cache: {
    privacy: "public",
    expiresIn: 60 * 60 * 1000,
  },
  description: "Owners intersection",
  notes: "Find which addresses own the most of a group of collections.",
  tags: ["api", "Owners"],
  plugins: {
    "hapi-swagger": {
      order: 6,
    },
  },
  validate: {
    query: Joi.object({
      collections: Joi.alternatives()
        .try(
          Joi.array()
            .items(
              Joi.string()
                .lowercase()
                .pattern(/^0x[a-fA-F0-9]{40}$/)
            )
            .min(1)
            .max(5)
            .description(
              "Filter to one or more collections. Max limit is 5. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
            ),
          Joi.string()
            .lowercase()
            .pattern(/^0x[a-fA-F0-9]{40}$/)
            .description(
              "Filter to one or more collections. Max limit is 5. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
            )
        )
        .required(),
      limit: Joi.number()
        .integer()
        .min(1)
        .max(50)
        .default(20)
        .description("Amount of owners returned in response. Max limit is 50."),
    }),
  },
  response: {
    schema: Joi.object({
      owners: Joi.array().items(
        Joi.object({
          address: Joi.string().description("Wallet Address"),
          count: Joi.number().description("Token Count"),
          collections: Joi.array(),
        })
      ),
    }).label(`getCrossCollectionsOwners${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(
        `get-cross-collections-owners-${version}-handler`,
        `Wrong response schema: ${error}`
      );
      throw error;
    },
  },
  handler: async (request: Request) => {
    let collectionsFilter = "";
    const query = request.query as any;

    if (query.collections) {
      if (!_.isArray(query.collections)) {
        query.collections = [query.collections];
      }

      for (const collection of query.collections) {
        const rawCollection = `'${_.replace(collection, "0x", "\\x")}'`;

        if (_.isUndefined((query as any).collectionsFilter)) {
          (query as any).collectionsFilter = [];
        }

        (query as any).collectionsFilter.push(rawCollection);
      }

      (query as any).collectionsFilter = _.join((query as any).collectionsFilter, ",");
      collectionsFilter = `contract IN ($/collectionsFilter:raw/)`;
    }

    try {
      const baseQuery = `
        WITH x AS (
          SELECT DISTINCT ON (owner, contract) owner, contract
          FROM nft_balances
          WHERE ${collectionsFilter}
          AND amount > 0
        )
        
        SELECT owner, array_agg(contract) AS "contracts", array_length(array_agg(contract), 1) AS "contract_count"
        FROM x
        GROUP BY x.owner
        ORDER BY contract_count DESC, owner ASC
        LIMIT ${query.limit}
      `;

      const result = await redb.manyOrNone(baseQuery, query).then((result) =>
        result.map((r) => ({
          address: fromBuffer(r.owner),
          count: Number(r.contract_count),
          collections: _.map(r.contracts, (contract) => fromBuffer(contract)),
        }))
      );

      return { owners: result };
    } catch (error) {
      logger.error(`get-cross-collections-owners-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
