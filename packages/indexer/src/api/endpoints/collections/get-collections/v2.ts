/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { formatEth, fromBuffer, toBuffer } from "@/common/utils";
import { getJoiCollectionObject } from "@/common/joi";
import { Assets, ImageSize } from "@/utils/assets";

const version = "v2";

export const getCollectionsV2Options: RouteOptions = {
  cache: {
    privacy: "public",
    expiresIn: 60000,
  },
  description: "Get a filtered list of collections",
  notes:
    "Useful for getting multiple collections to show in a marketplace, or search for particular collections.",
  tags: ["api", "x-deprecated"],
  plugins: {
    "hapi-swagger": {
      deprecated: true,
    },
  },
  validate: {
    query: Joi.object({
      community: Joi.string()
        .lowercase()
        .description("Filter to a particular community, e.g. `artblocks`"),
      contract: Joi.string()
        .lowercase()
        .pattern(/^0x[a-fA-F0-9]{40}$/)
        .description(
          "Filter to a particular contract, e.g. `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
      name: Joi.string()
        .lowercase()
        .description("Search for collections that match a string, e.g. `bored`"),
      slug: Joi.string().description("Filter to a particular slug, e.g. `boredapeyachtclub`"),
      sortBy: Joi.string()
        .valid("1DayVolume", "7DayVolume", "30DayVolume", "allTimeVolume")
        .default("allTimeVolume"),
      offset: Joi.number().integer().min(0).max(10000).default(0),
      limit: Joi.number().integer().min(1).max(20).default(20),
    }).or("community", "contract", "name", "sortBy"),
  },
  response: {
    schema: Joi.object({
      collections: Joi.array().items(
        Joi.object({
          id: Joi.string(),
          slug: Joi.string().allow("", null),
          name: Joi.string().allow("", null),
          image: Joi.string().allow("", null),
          banner: Joi.string().allow("", null),
          sampleImages: Joi.array().items(Joi.string().allow("", null)),
          tokenCount: Joi.string(),
          tokenSetId: Joi.string().allow(null),
          primaryContract: Joi.string()
            .lowercase()
            .pattern(/^0x[a-fA-F0-9]{40}$/),
          floorAskPrice: Joi.number().unsafe().allow(null),
          topBidValue: Joi.number().unsafe().allow(null),
          topBidMaker: Joi.string()
            .lowercase()
            .pattern(/^0x[a-fA-F0-9]{40}$/)
            .allow(null),
          "1dayVolume": Joi.number().unsafe().allow(null),
          "7dayVolume": Joi.number().unsafe().allow(null),
          "30dayVolume": Joi.number().unsafe().allow(null),
          allTimeVolume: Joi.number().unsafe().allow(null),
          allTimeRank: Joi.number().unsafe().allow(null),
        })
      ),
    }).label(`getCollections${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-collections-${version}-handler`, `Wrong response schema: ${error}`);

      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      let baseQuery = `
        SELECT
          collections.id,
          collections.slug,
          collections.name,
          (collections.metadata ->> 'imageUrl')::TEXT AS "image",
          collections.image_version AS "image_version",
          (collections.metadata ->> 'bannerImageUrl')::TEXT AS "banner",
          collections.contract,
          collections.token_set_id,
          collections.token_count,
          collections.metadata_disabled,
          (
            SELECT array(
              SELECT tokens.image FROM tokens
              WHERE tokens.collection_id = collections.id
              ORDER BY rarity_rank DESC NULLS LAST
              LIMIT 4
            )
          ) AS sample_images,
          (
            SELECT MIN(tokens.floor_sell_value) FROM tokens
            WHERE tokens.collection_id = collections.id
          ) AS floor_sell_value,
          collections.day1_volume,
          collections.day7_volume,
          collections.day30_volume,
          collections.all_time_volume,
          collections.all_time_rank
        FROM collections
      `;

      // Filters
      const conditions: string[] = [];
      if (query.community) {
        conditions.push(`collections.community = $/community/`);
      }
      if (query.contract) {
        query.contract = toBuffer(query.contract);
        conditions.push(`collections.contract = $/contract/`);
      }
      if (query.name) {
        query.name = `%${query.name}%`;
        conditions.push(`collections.name ILIKE $/name/`);
      }
      if (query.slug) {
        conditions.push(`collections.slug = $/slug/`);
      }
      if (conditions.length) {
        baseQuery += " WHERE " + conditions.map((c) => `(${c})`).join(" AND ");
      }

      // Sorting
      if (query.sortBy) {
        switch (query.sortBy) {
          case "1DayVolume":
            baseQuery += ` ORDER BY collections.day1_volume DESC`;
            break;

          case "7DayVolume":
            baseQuery += ` ORDER BY collections.day7_volume DESC`;
            break;

          case "30DayVolume":
            baseQuery += ` ORDER BY collections.day30_volume DESC`;
            break;

          case "allTimeVolume":
          default:
            baseQuery += ` ORDER BY collections.all_time_volume DESC`;
            break;
        }
      }

      // Pagination
      baseQuery += ` OFFSET $/offset/`;
      baseQuery += ` LIMIT $/limit/`;

      baseQuery = `
        WITH x AS (${baseQuery})
        SELECT
          x.*,
          y.*
        FROM x
        LEFT JOIN LATERAL (
          SELECT
            token_sets.top_buy_value,
            token_sets.top_buy_maker
          FROM token_sets
          WHERE token_sets.id = x.token_set_id
          ORDER BY token_sets.top_buy_value DESC
          LIMIT 1
        ) y ON TRUE
      `;

      const result = await redb.manyOrNone(baseQuery, query).then(async (result) => {
        return result.map((r) =>
          getJoiCollectionObject(
            {
              id: r.id,
              slug: r.slug,
              name: r.name,
              image:
                Assets.getResizedImageUrl(r.image, ImageSize.small, r.image_version) ||
                (r.sample_images?.length
                  ? Assets.getResizedImageUrl(r.sample_images[0], ImageSize.small, r.image_version)
                  : null),
              banner: Assets.getResizedImageUrl(r.banner),
              sampleImages: r.sample_images || [],
              tokenCount: String(r.token_count),
              primaryContract: fromBuffer(r.contract),
              tokenSetId: r.token_set_id,
              floorAskPrice: r.floor_sell_value ? formatEth(r.floor_sell_value) : null,
              topBidValue: r.top_buy_value ? formatEth(r.top_buy_value) : null,
              topBidMaker: r.top_buy_maker ? fromBuffer(r.top_buy_maker) : null,
              "1dayVolume": r.day1_volume ? formatEth(r.day1_volume) : null,
              "7dayVolume": r.day7_volume ? formatEth(r.day7_volume) : null,
              "30dayVolume": r.day30_volume ? formatEth(r.day30_volume) : null,
              allTimeVolume: r.all_time_volume ? formatEth(r.all_time_volume) : null,
              allTimeRank: r.all_time_rank,
            },
            r.metadata_disabled
          )
        );
      });

      return { collections: await Promise.all(result) };
    } catch (error) {
      logger.error(`get-collections-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
