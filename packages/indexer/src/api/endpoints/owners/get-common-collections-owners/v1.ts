/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { fromBuffer } from "@/common/utils";
import _ from "lodash";

const version = "v1";

export const getCommonCollectionsOwnersV1Options: RouteOptions = {
  cache: {
    privacy: "public",
    expiresIn: 60 * 60 * 1000,
  },
  description: "Common Collections",
  notes: "This API can be used to find top common collections from an array of owners.",
  tags: ["api", "Owners"],
  plugins: {
    "hapi-swagger": {
      order: 6,
    },
  },
  validate: {
    query: Joi.object({
      owners: Joi.alternatives()
        .try(
          Joi.array()
            .items(
              Joi.string()
                .lowercase()
                .pattern(/^0x[a-fA-F0-9]{40}$/)
            )
            .min(1)
            .max(50)
            .description(
              "Array of owner addresses. Max limit is 50. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
            ),
          Joi.string()
            .lowercase()
            .pattern(/^0x[a-fA-F0-9]{40}$/)
            .description(
              "Array of owner addresses. Max limit is 50. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
            )
        )
        .required(),
      limit: Joi.number()
        .integer()
        .min(1)
        .max(100)
        .default(20)
        .description("Amount of collections returned in response. Max limit is 100."),
    }),
  },
  response: {
    schema: Joi.object({
      collections: Joi.array().items(
        Joi.object({
          address: Joi.string().description("Contract address"),
          count: Joi.number().description("Token count"),
          owners: Joi.array(),
        })
      ),
    }).label(`getCommonCollectionsOwners${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(
        `get-common-collections-owners-${version}-handler`,
        `Wrong response schema: ${error}`
      );
      throw error;
    },
  },
  handler: async (request: Request) => {
    let ownersFilter = "";
    const query = request.query as any;

    if (query.owners) {
      if (!_.isArray(query.owners)) {
        query.owners = [query.owners];
      }

      for (const owner of query.owners) {
        const rawOwner = `'${_.replace(owner, "0x", "\\x")}'`;

        if (_.isUndefined((query as any).ownersFilter)) {
          (query as any).ownersFilter = [];
        }

        (query as any).ownersFilter.push(rawOwner);
      }

      (query as any).ownersFilter = _.join((query as any).ownersFilter, ",");
      ownersFilter = `owner IN ($/ownersFilter:raw/)`;
    }

    try {
      const baseQuery = `
        WITH x AS (
          SELECT DISTINCT ON (owner, contract) owner, contract
          FROM nft_balances
          WHERE ${ownersFilter}
          AND amount > 0
        )
        
        SELECT contract, array_agg(owner) AS "owners", array_length(array_agg(owner), 1) AS "owner_count"
        FROM x
        GROUP BY x.contract
        ORDER BY owner_count DESC, contract ASC
        LIMIT ${query.limit}
      `;

      const result = await redb.manyOrNone(baseQuery, query).then((result) =>
        result.map((r) => ({
          address: fromBuffer(r.contract),
          count: Number(r.owner_count),
          owners: _.map(r.owners, (owner) => fromBuffer(owner)),
        }))
      );

      return { collections: result };
    } catch (error) {
      logger.error(`get-common-collections-owners-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
