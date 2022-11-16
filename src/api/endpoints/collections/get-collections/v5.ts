/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import * as Boom from "@hapi/boom";
import * as Sdk from "@reservoir0x/sdk";
import _ from "lodash";
import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { JoiPrice, getJoiPriceObject } from "@/common/joi";
import {
  buildContinuation,
  formatEth,
  fromBuffer,
  regex,
  splitContinuation,
  toBuffer,
} from "@/common/utils";
import { config } from "@/config/index";
import { CollectionSets } from "@/models/collection-sets";
import { Sources } from "@/models/sources";
import { Assets } from "@/utils/assets";

const version = "v5";

export const getCollectionsV5Options: RouteOptions = {
  cache: {
    privacy: "public",
    expiresIn: 10000,
  },
  description: "Collections",
  notes:
    "Useful for getting multiple collections to show in a marketplace, or search for particular collections.",
  tags: ["api", "Collections"],
  plugins: {
    "hapi-swagger": {
      order: 3,
    },
  },
  validate: {
    query: Joi.object({
      id: Joi.string()
        .lowercase()
        .description(
          "Filter to a particular collection with collection id. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
      slug: Joi.string()
        .lowercase()
        .description("Filter to a particular collection slug. Example: `boredapeyachtclub`"),
      collectionsSetId: Joi.string()
        .lowercase()
        .description("Filter to a particular collection set."),
      community: Joi.string()
        .lowercase()
        .description("Filter to a particular community. Example: `artblocks`"),
      contract: Joi.alternatives()
        .try(
          Joi.array().items(Joi.string().lowercase().pattern(regex.address)).max(20),
          Joi.string().lowercase().pattern(regex.address)
        )
        .description("Array of contracts. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"),
      name: Joi.string()
        .lowercase()
        .description("Search for collections that match a string. Example: `bored`"),
      includeTopBid: Joi.boolean()
        .default(false)
        .description("If true, top bid will be returned in the response."),
      includeAttributes: Joi.boolean()
        .when("id", { is: Joi.exist(), then: Joi.allow(), otherwise: Joi.forbidden() })
        .description(
          "If true, attributes will be included in the response. (supported only when filtering to a particular collection using `id`)"
        ),
      includeOwnerCount: Joi.boolean()
        .when("id", { is: Joi.exist(), then: Joi.allow(), otherwise: Joi.forbidden() })
        .description(
          "If true, owner count will be included in the response. (supported only when filtering to a particular collection using `id`)"
        ),
      normalizeRoyalties: Joi.boolean()
        .default(false)
        .description("If true, prices will include missing royalties to be added on-top."),
      sortBy: Joi.string()
        .valid(
          "1DayVolume",
          "7DayVolume",
          "30DayVolume",
          "allTimeVolume",
          "createdAt",
          "floorAskPrice"
        )
        .default("allTimeVolume")
        .description("Order the items are returned in the response."),
      limit: Joi.number()
        .integer()
        .min(1)
        .max(20)
        .default(20)
        .description("Amount of items returned in response."),
      continuation: Joi.string().description(
        "Use continuation token to request next offset of items."
      ),
    }).oxor("id", "slug", "name", "collectionsSetId", "community", "contract"),
  },
  response: {
    schema: Joi.object({
      continuation: Joi.string().allow(null),
      collections: Joi.array().items(
        Joi.object({
          id: Joi.string(),
          slug: Joi.string().allow(null, "").description("Open Sea slug"),
          createdAt: Joi.string(),
          name: Joi.string().allow(null, ""),
          image: Joi.string().allow(null, ""),
          banner: Joi.string().allow(null, ""),
          discordUrl: Joi.string().allow(null, ""),
          externalUrl: Joi.string().allow(null, ""),
          twitterUsername: Joi.string().allow(null, ""),
          openseaVerificationStatus: Joi.string().allow(null, ""),
          description: Joi.string().allow(null, ""),
          sampleImages: Joi.array().items(Joi.string().allow(null, "")),
          tokenCount: Joi.string(),
          onSaleCount: Joi.string(),
          primaryContract: Joi.string().lowercase().pattern(regex.address),
          tokenSetId: Joi.string().allow(null),
          royalties: Joi.object({
            recipient: Joi.string().allow(null, ""),
            bps: Joi.number(),
          }).allow(null),
          lastBuy: {
            value: Joi.string().allow(null),
            timestamp: Joi.number().allow(null),
          },
          floorAsk: {
            id: Joi.string().allow(null),
            sourceDomain: Joi.string().allow(null, ""),
            price: JoiPrice.allow(null),
            maker: Joi.string().lowercase().pattern(regex.address).allow(null),
            validFrom: Joi.string().allow(null),
            validUntil: Joi.string().allow(null),
            token: Joi.object({
              contract: Joi.string().lowercase().pattern(regex.address).allow(null),
              tokenId: Joi.string().pattern(regex.number).allow(null),
              name: Joi.string().allow(null),
              image: Joi.string().allow(null, ""),
            }).allow(null),
          },
          topBid: Joi.object({
            id: Joi.string().allow(null),
            sourceDomain: Joi.string().allow(null, ""),
            price: JoiPrice.allow(null),
            maker: Joi.string().lowercase().pattern(regex.address).allow(null),
            validFrom: Joi.string().allow(null),
            validUntil: Joi.string().allow(null),
          }).optional(),
          rank: Joi.object({
            "1day": Joi.string().allow(null),
            "7day": Joi.string().allow(null),
            "30day": Joi.string().allow(null),
            allTime: Joi.string().allow(null),
          }),
          volume: Joi.object({
            "1day": Joi.string().allow(null),
            "7day": Joi.string().allow(null),
            "30day": Joi.string().allow(null),
            allTime: Joi.string().allow(null),
          }),
          volumeChange: {
            "1day": Joi.string().allow(null),
            "7day": Joi.string().allow(null),
            "30day": Joi.string().allow(null),
          },
          floorSale: {
            "1day": Joi.string().allow(null),
            "7day": Joi.string().allow(null),
            "30day": Joi.string().allow(null),
          },
          floorSaleChange: {
            "1day": Joi.string().allow(null),
            "7day": Joi.string().allow(null),
            "30day": Joi.string().allow(null),
          },
          collectionBidSupported: Joi.boolean(),
          ownerCount: Joi.number().optional(),
          attributes: Joi.array()
            .items(
              Joi.object({
                key: Joi.string().allow(null, ""),
                kind: Joi.string().allow(null, ""),
                count: Joi.number().allow(null, ""),
              })
            )
            .optional(),
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
      // Include top bid
      let topBidSelectQuery = "";
      let topBidJoinQuery = "";
      if (query.includeTopBid) {
        topBidSelectQuery += `, u.*`;
        topBidJoinQuery = `LEFT JOIN LATERAL (
          SELECT
            token_sets.top_buy_id,
            token_sets.top_buy_maker,
            DATE_PART('epoch', LOWER(orders.valid_between)) AS top_buy_valid_from,
            COALESCE(
              NULLIF(DATE_PART('epoch', UPPER(orders.valid_between)), 'Infinity'),
              0
            ) AS top_buy_valid_until,
            token_sets.last_buy_value,
            token_sets.last_buy_timestamp,
            orders.currency AS top_buy_currency,
            orders.price AS top_buy_price,
            orders.value AS top_buy_value,
            orders.currency_price AS top_buy_currency_price,
            orders.source_id_int AS top_buy_source_id_int,
            orders.currency_value AS top_buy_currency_value,
            orders.normalized_value AS top_buy_normalized_value,
            orders.currency_normalized_value AS top_buy_currency_normalized_value
          FROM token_sets
          LEFT JOIN orders
            ON token_sets.top_buy_id = orders.id
          WHERE token_sets.collection_id = x.id
          ORDER BY token_sets.top_buy_value DESC NULLS LAST
          LIMIT 1
        ) u ON TRUE`;
      }

      // Include attributes
      let attributesSelectQuery = "";
      let attributesJoinQuery = "";
      if (query.includeAttributes) {
        attributesSelectQuery = ", w.*";
        attributesJoinQuery = `
          LEFT JOIN LATERAL (
            SELECT
              array_agg(
                json_build_object(
                  'key', key,
                  'kind', kind,
                  'count', attribute_count,
                  'rank', rank
                )
              ) AS attributes
            FROM attribute_keys
              WHERE attribute_keys.collection_id = x.id
            GROUP BY attribute_keys.collection_id
          ) w ON TRUE
        `;
      }

      // Include owner count
      let ownerCountSelectQuery = "";
      let ownerCountJoinQuery = "";
      if (query.includeOwnerCount) {
        ownerCountSelectQuery = ", z.*";
        ownerCountJoinQuery = `
          LEFT JOIN LATERAL (
            SELECT
              COUNT(DISTINCT(owner)) AS owner_count
            FROM nft_balances
            WHERE nft_balances.contract = x.contract
              AND nft_balances.token_id <@ x.token_id_range
            AND amount > 0
          ) z ON TRUE
        `;
      }

      let baseQuery = `
        SELECT
          collections.id,
          collections.slug,
          collections.name,
          (collections.metadata ->> 'imageUrl')::TEXT AS "image",
          (collections.metadata ->> 'bannerImageUrl')::TEXT AS "banner",
          (collections.metadata ->> 'discordUrl')::TEXT AS "discord_url",
          (collections.metadata ->> 'description')::TEXT AS "description",
          (collections.metadata ->> 'externalUrl')::TEXT AS "external_url",
          (collections.metadata ->> 'twitterUsername')::TEXT AS "twitter_username",
          (collections.metadata ->> 'safelistRequestStatus')::TEXT AS "opensea_verification_status",
          collections.royalties,
          collections.contract,
          collections.token_id_range,
          collections.token_set_id,
          collections.day1_rank,
          collections.day1_volume,
          collections.day7_rank,
          collections.day7_volume,
          collections.day30_rank,
          collections.day30_volume,
          collections.all_time_rank,
          collections.all_time_volume,
          collections.day1_volume_change,
          collections.day7_volume_change,
          collections.day30_volume_change,
          collections.day1_floor_sell_value,
          collections.day7_floor_sell_value,
          collections.day30_floor_sell_value,
          collections.floor_sell_value,
          collections.token_count,
          collections.created_at,
          (
            SELECT
              COUNT(*)
            FROM tokens
            WHERE tokens.collection_id = collections.id
              AND tokens.floor_sell_value IS NOT NULL
          ) AS on_sale_count,
          ARRAY(
            SELECT
              tokens.image
            FROM tokens
            WHERE tokens.collection_id = collections.id
              AND tokens.image IS NOT NULL
            LIMIT 4
          ) AS sample_images
        FROM collections
      `;

      // Filtering

      const conditions: string[] = [];

      if (query.id) {
        conditions.push("collections.id = $/id/");
      }
      if (query.slug) {
        conditions.push("collections.slug = $/slug/");
      }
      if (query.community) {
        conditions.push("collections.community = $/community/");
      }
      if (query.collectionsSetId) {
        query.collectionsIds = await CollectionSets.getCollectionsIds(query.collectionsSetId);
        if (_.isEmpty(query.collectionsIds)) {
          throw Boom.badRequest(`No collections for collection set ${query.collectionsSetId}`);
        }

        conditions.push(`collections.id IN ($/collectionsIds:csv/)`);
      }
      if (query.contract) {
        if (!Array.isArray(query.contract)) {
          query.contract = [query.contract];
        }
        query.contract = query.contract.map((contract: string) => toBuffer(contract));
        conditions.push(`collections.contract IN ($/contract:csv/)`);
      }
      if (query.name) {
        query.name = `%${query.name}%`;
        conditions.push(`collections.name ILIKE $/name/`);
      }

      // Sorting and pagination

      if (query.continuation) {
        const [contParam, contId] = _.split(splitContinuation(query.continuation)[0], "_");
        query.contParam = contParam;
        query.contId = contId;
      }

      let orderBy = "";
      switch (query.sortBy) {
        case "1DayVolume": {
          if (query.continuation) {
            conditions.push(
              `(collections.day1_volume, collections.id) < ($/contParam/, $/contId/)`
            );
          }
          orderBy = ` ORDER BY collections.day1_volume DESC, collections.id DESC`;

          break;
        }

        case "7DayVolume": {
          if (query.continuation) {
            conditions.push(
              `(collections.day7_volume, collections.id) < ($/contParam/, $/contId/)`
            );
          }
          orderBy = ` ORDER BY collections.day7_volume DESC, collections.id DESC`;

          break;
        }

        case "30DayVolume": {
          if (query.continuation) {
            conditions.push(
              `(collections.day30_volume, collections.id) < ($/contParam/, $/contId/)`
            );
          }
          orderBy = ` ORDER BY collections.day30_volume DESC, collections.id DESC`;

          break;
        }

        case "createdAt": {
          if (query.continuation) {
            conditions.push(`(collections.created_at, collections.id) < ($/contParam/, $/contId/)`);
          }
          orderBy = ` ORDER BY collections.created_at DESC, collections.id DESC`;

          break;
        }

        case "floorAskPrice": {
          if (query.continuation) {
            conditions.push(
              `(collections.floor_sell_value, collections.id) > ($/contParam/, $/contId/)`
            );
          }
          orderBy = ` ORDER BY collections.floor_sell_value, collections.id`;

          break;
        }

        case "allTimeVolume":
        default: {
          if (query.continuation) {
            conditions.push(
              `(collections.all_time_volume, collections.id) < ($/contParam/, $/contId/)`
            );
          }

          orderBy = ` ORDER BY collections.all_time_volume DESC, collections.id DESC`;

          break;
        }
      }

      if (conditions.length) {
        baseQuery += " WHERE " + conditions.map((c) => `(${c})`).join(" AND ");
      }

      baseQuery += orderBy;
      baseQuery += ` LIMIT $/limit/`;

      baseQuery = `
        WITH x AS (${baseQuery})
        SELECT
          x.*,
          y.*
          ${ownerCountSelectQuery}
          ${attributesSelectQuery}
          ${topBidSelectQuery}
        FROM x
        LEFT JOIN LATERAL (
          SELECT
            tokens.floor_sell_source_id_int,
            tokens.contract AS floor_sell_token_contract,
            tokens.token_id AS floor_sell_token_id,
            tokens.name AS floor_sell_token_name,
            tokens.image AS floor_sell_token_image,
            tokens.floor_sell_id,
            tokens.floor_sell_value,
            tokens.floor_sell_maker,
            tokens.floor_sell_valid_from,
            tokens.floor_sell_valid_to AS floor_sell_valid_until,
            tokens.floor_sell_currency,
            tokens.floor_sell_currency_value,
            orders.normalized_value AS floor_sell_normalized_value,
            orders.currency_normalized_value AS floor_sell_currency_normalized_value
          FROM tokens
          LEFT JOIN orders ON tokens.floor_sell_id = orders.id
          WHERE tokens.collection_id = x.id
          ORDER BY tokens.floor_sell_value
          LIMIT 1
        ) y ON TRUE
        ${ownerCountJoinQuery}
        ${attributesJoinQuery}
        ${topBidJoinQuery}
      `;

      // Any further joins might not preserve sorting
      baseQuery += orderBy.replace(/collections/g, "x");

      const results = await redb.manyOrNone(baseQuery, query);

      const sources = await Sources.getInstance();
      const collections = await Promise.all(
        results.map(async (r) => {
          // Use default currencies for backwards compatibility with entries
          // that don't have the currencies cached in the tokens table
          const floorAskCurrency = r.floor_sell_currency
            ? fromBuffer(r.floor_sell_currency)
            : Sdk.Common.Addresses.Eth[config.chainId];

          const topBidCurrency = r.top_buy_currency
            ? fromBuffer(r.top_buy_currency)
            : Sdk.Common.Addresses.Weth[config.chainId];

          return {
            id: r.id,
            slug: r.slug,
            createdAt: new Date(r.created_at).toISOString(),
            name: r.name,
            image:
              r.image ??
              (r.sample_images?.length ? Assets.getLocalAssetsLink(r.sample_images[0]) : null),
            banner: r.banner,
            discordUrl: r.discord_url,
            externalUrl: r.external_url,
            twitterUsername: r.twitter_username,
            openseaVerificationStatus: r.opensea_verification_status,
            description: r.description,
            sampleImages: Assets.getLocalAssetsLink(r.sample_images) ?? [],
            tokenCount: String(r.token_count),
            onSaleCount: String(r.on_sale_count),
            primaryContract: fromBuffer(r.contract),
            tokenSetId: r.token_set_id,
            royalties: r.royalties ? r.royalties[0] : null,
            lastBuy: {
              value: r.last_buy_value ? formatEth(r.last_buy_value) : null,
              timestamp: r.last_buy_timestamp,
            },
            floorAsk: {
              id: r.floor_sell_id,
              sourceDomain: sources.get(r.floor_sell_source_id_int)?.domain,
              price: r.floor_sell_id
                ? await getJoiPriceObject(
                    {
                      gross: {
                        amount: query.normalizeRoyalties
                          ? r.floor_sell_currency_normalized_value ?? r.floor_sell_value
                          : r.floor_sell_currency_value ?? r.floor_sell_value,
                        nativeAmount: query.normalizeRoyalties
                          ? r.floor_sell_normalized_value ?? r.floor_sell_value
                          : r.floor_sell_value,
                      },
                    },
                    floorAskCurrency
                  )
                : null,
              maker: r.floor_sell_maker ? fromBuffer(r.floor_sell_maker) : null,
              validFrom: r.floor_sell_valid_from,
              validUntil: r.floor_sell_value ? r.floor_sell_valid_until : null,
              token: r.floor_sell_value && {
                contract: r.floor_sell_token_contract
                  ? fromBuffer(r.floor_sell_token_contract)
                  : null,
                tokenId: r.floor_sell_token_id,
                name: r.floor_sell_token_name,
                image: Assets.getLocalAssetsLink(r.floor_sell_token_image),
              },
            },
            topBid: query.includeTopBid
              ? {
                  id: r.top_buy_id,
                  sourceDomain: sources.get(r.top_buy_source_id_int)?.domain,
                  price: r.top_buy_id
                    ? await getJoiPriceObject(
                        {
                          net: {
                            amount: query.normalizeRoyalties
                              ? r.top_buy_currency_normalized_value ?? r.top_buy_value
                              : r.top_buy_currency_value ?? r.top_buy_value,
                            nativeAmount: query.normalizeRoyalties
                              ? r.top_buy_normalized_value ?? r.top_buy_value
                              : r.top_buy_value,
                          },
                          gross: {
                            amount: r.top_buy_currency_price ?? r.top_buy_price,
                            nativeAmount: r.top_buy_price,
                          },
                        },
                        topBidCurrency
                      )
                    : null,
                  maker: r.top_buy_maker ? fromBuffer(r.top_buy_maker) : null,
                  validFrom: r.top_buy_valid_from,
                  validUntil: r.top_buy_value ? r.top_buy_valid_until : null,
                }
              : undefined,
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
            collectionBidSupported: Number(r.token_count) <= config.maxTokenSetSize,
            ownerCount: query.includeOwnerCount ? Number(r.owner_count) : undefined,
            attributes: query.includeAttributes
              ? _.map(_.sortBy(r.attributes, ["rank", "key"]), (attribute) => ({
                  key: attribute.key,
                  kind: attribute.kind,
                  count: Number(attribute.count),
                }))
              : undefined,
          };
        })
      );

      // Pagination

      let continuation: string | null = null;
      if (results.length >= query.limit) {
        const lastCollection = _.last(results);
        if (lastCollection) {
          switch (query.sortBy) {
            case "1DayVolume": {
              continuation = buildContinuation(
                `${lastCollection.day1_volume}_${lastCollection.id}`
              );
              break;
            }

            case "7DayVolume": {
              continuation = buildContinuation(
                `${lastCollection.day7_volume}_${lastCollection.id}`
              );
              break;
            }

            case "30DayVolume": {
              continuation = buildContinuation(
                `${lastCollection.day30_volume}_${lastCollection.id}`
              );
              break;
            }

            case "createdAt": {
              continuation = buildContinuation(
                `${new Date(lastCollection.created_at).toISOString()}_${lastCollection.id}`
              );
              break;
            }

            case "floorAskPrice": {
              continuation = buildContinuation(
                `${lastCollection.floor_sell_value}_${lastCollection.id}`
              );
              break;
            }

            case "allTimeVolume":
            default: {
              continuation = buildContinuation(
                `${lastCollection.all_time_volume}_${lastCollection.id}`
              );
              break;
            }
          }
        }
      }

      return {
        collections,
        continuation: continuation ? continuation : undefined,
      };
    } catch (error) {
      logger.error(`get-collections-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
