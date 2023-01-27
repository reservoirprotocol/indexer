/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { redb } from "@/common/db";
import { formatEth, fromBuffer } from "@/common/utils";
import { CollectionSets } from "@/models/collection-sets";
import { Assets } from "@/utils/assets";

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
          image: Joi.string().allow("", null),
          name: Joi.string().allow("", null),
          allTimeVolume: Joi.number().unsafe().allow(null),
          floorAskPrice: Joi.number().unsafe().allow(null),
          openseaVerificationStatus: Joi.string().allow("", null),
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
    const conditions: string[] = [`token_count > 0`];

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
            SELECT id, name, contract, (metadata ->> 'imageUrl')::TEXT AS image, all_time_volume, floor_sell_value,
                   (metadata ->> 'safelistRequestStatus')::TEXT AS opensea_verification_status
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
        image: Assets.getLocalAssetsLink(collection.image),
        allTimeVolume: collection.all_time_volume ? formatEth(collection.all_time_volume) : null,
        floorAskPrice: collection.floor_sell_value ? formatEth(collection.floor_sell_value) : null,
        openseaVerificationStatus: collection.opensea_verification_status,
      })),
    };
  },
};
