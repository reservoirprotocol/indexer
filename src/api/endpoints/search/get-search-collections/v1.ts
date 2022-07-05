/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { redb } from "@/common/db";
import { fromBuffer } from "@/common/utils";
import { CollectionSets } from "@/models/collection-sets";

const version = "v1";

export const getSearchCollectionsV1Options: RouteOptions = {
  cache: {
    privacy: "public",
    expiresIn: 10000,
  },
  description: "Search collections",
  tags: ["api", "Collections"],
  plugins: {
    "hapi-swagger": {
      order: 3,
    },
  },
  validate: {
    query: Joi.object({
      name: Joi.string()
        .lowercase()
        .description("Lightweight search for collections that match a string. Example: `bored`"),
      community: Joi.string()
        .lowercase()
        .description("Filter to a particular community. Example: `artblocks`"),
      collectionsSetId: Joi.string()
        .lowercase()
        .description("Filter to a particular collection set"),
      limit: Joi.number()
        .integer()
        .min(1)
        .max(50)
        .default(20)
        .description("Amount of items returned in response."),
    }),
  },
  response: {
    schema: Joi.object({
      collections: Joi.array().items(
        Joi.object({
          collectionId: Joi.string(),
          contract: Joi.string(),
          image: Joi.string().allow(null, ""),
          name: Joi.string(),
        })
      ),
    }).label(`getSearchCollections${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-search-collections-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;
    let whereClause = "";
    const conditions: string[] = [];

    if (query.name) {
      query.name = `%${query.name}%`;
      conditions.push(`name ILIKE $/name/`);
    }

    if (query.community) {
      conditions.push(`collections.community = $/community/`);
    }

    if (query.collectionsSetId) {
      const collectionsIds = await CollectionSets.getCollectionsIds(query.collectionsSetId);

      if (!_.isEmpty(collectionsIds)) {
        query.collectionsIds = _.join(collectionsIds, "','");
        conditions.push(`collections.id IN ('$/collectionsIds:raw/')`);
      }
    }

    if (conditions.length) {
      whereClause = " WHERE " + conditions.map((c) => `(${c})`).join(" AND ");
    }

    const baseQuery = `
            SELECT id, name, contract, (metadata ->> 'imageUrl')::TEXT AS image
            FROM collections
            ${whereClause}
            ORDER BY all_time_volume DESC
            OFFSET 0
            LIMIT $/limit/`;

    const collections = await redb.manyOrNone(baseQuery, query);

    return {
      collections: _.map(collections, (collection) => ({
        collectionId: collection.id,
        name: collection.name,
        contract: fromBuffer(collection.contract),
        image: collection.image,
      })),
    };
  },
};
