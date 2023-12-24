/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { formatEth, fromBuffer } from "@/common/utils";
import { CollectionSets } from "@/models/collection-sets";
import { getJoiCollectionObject } from "@/common/joi";
import { Assets, ImageSize } from "@/utils/assets";

const version = "v4";

export const getCollectionsV4Options: RouteOptions = {
  cache: {
    privacy: "public",
    expiresIn: 10000,
  },
  description: "Collections",
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
      collectionsSetId: Joi.string()
        .lowercase()
        .description("Filter to a particular collection set."),
      community: Joi.string()
        .lowercase()
        .description("Filter to a particular community. Example: `artblocks`"),
      contract: Joi.alternatives()
        .try(
          Joi.array()
            .items(
              Joi.string()
                .lowercase()
                .pattern(/^0x[a-fA-F0-9]{40}$/)
            )
            .max(20),
          Joi.string()
            .lowercase()
            .pattern(/^0x[a-fA-F0-9]{40}$/)
        )
        .description("Array of contract. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"),
      name: Joi.string()
        .lowercase()
        .description("Search for collections that match a string. Example: `bored`"),
      slug: Joi.string().description(
        "Filter to a particular collection slug. Example: `boredapeyachtclub`"
      ),
      sortBy: Joi.string()
        .valid("1DayVolume", "7DayVolume", "30DayVolume", "allTimeVolume")
        .default("allTimeVolume")
        .description("Order the items are returned in the response."),
      includeTopBid: Joi.boolean()
        .default(false)
        .description("If true, top bid will be returned in the response."),
      limit: Joi.number()
        .integer()
        .min(1)
        .max(20)
        .default(20)
        .description("Amount of items returned in response."),
      continuation: Joi.string().description(
        "Use continuation token to request next offset of items."
      ),
    }).or("collectionsSetId", "community", "contract", "name", "sortBy"),
  },
  response: {
    schema: Joi.object({
      continuation: Joi.string().allow(null),
      collections: Joi.array().items(
        Joi.object({
          id: Joi.string(),
          slug: Joi.string().allow("", null),
          name: Joi.string().allow("", null),
          image: Joi.string().allow("", null),
          banner: Joi.string().allow("", null),
          discordUrl: Joi.string().allow("", null),
          externalUrl: Joi.string().allow("", null),
          twitterUsername: Joi.string().allow("", null),
          description: Joi.string().allow("", null),
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
          rank: Joi.object({
            "1day": Joi.number().unsafe().allow(null),
            "7day": Joi.number().unsafe().allow(null),
            "30day": Joi.number().unsafe().allow(null),
            allTime: Joi.number().unsafe().allow(null),
          }),
          volume: Joi.object({
            "1day": Joi.number().unsafe().allow(null),
            "7day": Joi.number().unsafe().allow(null),
            "30day": Joi.number().unsafe().allow(null),
            allTime: Joi.number().unsafe().allow(null),
          }),
          volumeChange: {
            "1day": Joi.number().unsafe().allow(null),
            "7day": Joi.number().unsafe().allow(null),
            "30day": Joi.number().unsafe().allow(null),
          },
          floorSale: {
            "1day": Joi.number().unsafe().allow(null),
            "7day": Joi.number().unsafe().allow(null),
            "30day": Joi.number().unsafe().allow(null),
          },
          floorSaleChange: {
            "1day": Joi.number().unsafe().allow(null),
            "7day": Joi.number().unsafe().allow(null),
            "30day": Joi.number().unsafe().allow(null),
          },
        })
      ),
    }).label(`getCollections${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-collections-${version}-handler`, `Wrong response schema: ${error}`);

      throw error;
    },
  },
  handler: async (request: Request) => {
    let collections = [] as any;
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
          (collections.metadata ->> 'discordUrl')::TEXT AS "discord_url",
          (collections.metadata ->> 'description')::TEXT AS "description",
          (collections.metadata ->> 'externalUrl')::TEXT AS "external_url",
          (collections.metadata ->> 'twitterUsername')::TEXT AS "twitter_username",
          collections.contract,
          collections.token_set_id,
          collections.token_count,
          collections.metadata_disabled,
          (
            SELECT array(
              SELECT tokens.image FROM tokens
              WHERE tokens.collection_id = collections.id
              AND tokens.image IS NOT NULL
              ORDER BY rarity_rank DESC NULLS LAST
              LIMIT 4
            )
          ) AS sample_images,
          collections.floor_sell_value,
          collections.day1_volume,
          collections.day7_volume,
          collections.day30_volume,
          collections.all_time_volume,
          collections.day1_rank,
          collections.day7_rank,
          collections.day30_rank,
          collections.all_time_rank,
          collections.day1_volume_change,
          collections.day7_volume_change,
          collections.day30_volume_change,
          collections.day1_floor_sell_value,
          collections.day7_floor_sell_value,
          collections.day30_floor_sell_value
        FROM collections
      `;

      // Filters
      const conditions: string[] = [];
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

      if (query.contract) {
        if (!_.isArray(query.contract)) {
          query.contract = [query.contract];
        }

        for (const contract of query.contract) {
          const contractsFilter = `'${_.replace(contract, "0x", "\\x")}'`;

          if (_.isUndefined((query as any).contractsFilter)) {
            (query as any).contractsFilter = [];
          }

          (query as any).contractsFilter.push(contractsFilter);
        }

        (query as any).contractsFilter = _.join((query as any).contractsFilter, ",");
        conditions.push(`collections.contract IN ($/contractsFilter:raw/)`);
      }

      if (query.name) {
        query.name = `%${query.name}%`;
        conditions.push(`collections.name ILIKE $/name/`);
      }

      if (query.slug) {
        conditions.push(`collections.slug = $/slug/`);
      }

      let orderBy = ` ORDER BY collections.all_time_volume DESC`;

      // Sorting
      switch (query.sortBy) {
        case "1DayVolume":
          if (query.continuation) {
            conditions.push(`collections.day1_volume < $/continuation/`);
          }

          orderBy = ` ORDER BY collections.day1_volume DESC`;
          break;

        case "7DayVolume":
          if (query.continuation) {
            conditions.push(`collections.day7_volume < $/continuation/`);
          }

          orderBy = ` ORDER BY collections.day7_volume DESC`;
          break;

        case "30DayVolume":
          if (query.continuation) {
            conditions.push(`collections.day30_volume < $/continuation/`);
          }

          orderBy = ` ORDER BY collections.day30_volume DESC`;
          break;

        case "allTimeVolume":
        default:
          if (query.continuation) {
            conditions.push(`collections.all_time_volume < $/continuation/`);
          }
          break;
      }

      if (conditions.length) {
        baseQuery += " WHERE " + conditions.map((c) => `(${c})`).join(" AND ");
      }

      baseQuery += orderBy;

      // Pagination
      baseQuery += ` LIMIT $/limit/`;

      let topBidQuery = "";
      if (query.includeTopBid) {
        topBidQuery = `LEFT JOIN LATERAL (
          SELECT
            token_sets.top_buy_value,
            token_sets.top_buy_maker
          FROM token_sets
          WHERE token_sets.id = x.token_set_id
          ORDER BY token_sets.top_buy_value DESC
          LIMIT 1
        ) y ON TRUE`;
      }

      baseQuery = `
        WITH x AS (${baseQuery})
        SELECT *
        FROM x
        ${topBidQuery}
      `;

      const result = await redb.manyOrNone(baseQuery, query);

      if (result) {
        collections = result.map((r) => {
          let imageUrl = r.image;
          if (imageUrl) {
            imageUrl = Assets.getResizedImageUrl(imageUrl, ImageSize.small, r.image_version);
          } else if (r.sample_images.length) {
            imageUrl = Assets.getResizedImageUrl(r.sample_images[0], ImageSize.small);
          }

          const response = getJoiCollectionObject(
            {
              id: r.id,
              slug: r.slug,
              name: r.name,
              image: imageUrl || null,
              banner: Assets.getResizedImageUrl(r.banner),
              discordUrl: r.discord_url,
              externalUrl: r.external_url,
              twitterUsername: r.twitter_username,
              description: r.description,
              sampleImages: r.sample_images || [],
              tokenCount: String(r.token_count),
              primaryContract: fromBuffer(r.contract),
              tokenSetId: r.token_set_id,
              floorAskPrice: r.floor_sell_value ? formatEth(r.floor_sell_value) : null,
              rank: {
                "1day": r.day1_rank,
                "7day": r.day7_rank,
                "30day": r.day30_rank,
                allTime: r.all_time_rank,
              },
              volume: {
                "1day": r.day1_volume ? formatEth(r.day1_volume) : null,
                "7day": r.day7_volume ? formatEth(r.day7_volume) : null,
                "30day": r.day30_volume ? formatEth(r.day30_volume) : null,
                allTime: r.all_time_volume ? formatEth(r.all_time_volume) : null,
              },
              volumeChange: {
                "1day": r.day1_volume_change,
                "7day": r.day7_volume_change,
                "30day": r.day30_volume_change,
              },
              floorSale: {
                "1day": r.day1_floor_sell_value ? formatEth(r.day1_floor_sell_value) : null,
                "7day": r.day7_floor_sell_value ? formatEth(r.day7_floor_sell_value) : null,
                "30day": r.day30_floor_sell_value ? formatEth(r.day30_floor_sell_value) : null,
              },
              floorSaleChange: {
                "1day": Number(r.day1_floor_sell_value)
                  ? Number(r.floor_sell_value) / Number(r.day1_floor_sell_value)
                  : null,
                "7day": Number(r.day7_floor_sell_value)
                  ? Number(r.floor_sell_value) / Number(r.day7_floor_sell_value)
                  : null,
                "30day": Number(r.day30_floor_sell_value)
                  ? Number(r.floor_sell_value) / Number(r.day30_floor_sell_value)
                  : null,
              },
            },
            r.metadata_disabled
          );

          if (query.includeTopBid) {
            (response as any).topBidValue = r.top_buy_value ? formatEth(r.top_buy_value) : null;
            (response as any).topBidMaker = r.top_buy_maker ? fromBuffer(r.top_buy_maker) : null;
          }

          return response;
        });
      }

      // Set the continuation
      let continuation = null;
      if (result.length === query.limit) {
        const lastCollection = _.last(result);

        if (lastCollection) {
          switch (query.sortBy) {
            case "1DayVolume":
              continuation = lastCollection.day1_volume;
              break;

            case "7DayVolume":
              continuation = lastCollection.day7_volume;
              break;

            case "30DayVolume":
              continuation = lastCollection.day30_volume;
              break;

            case "allTimeVolume":
            default:
              continuation = lastCollection.all_time_volume;
              break;
          }
        }
      }

      return { collections, continuation };
    } catch (error) {
      logger.error(`get-collections-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
