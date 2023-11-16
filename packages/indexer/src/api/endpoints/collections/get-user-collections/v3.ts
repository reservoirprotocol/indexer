/* eslint-disable @typescript-eslint/no-explicit-any */
import _ from "lodash";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { formatEth, fromBuffer, regex, toBuffer } from "@/common/utils";
import { CollectionSets } from "@/models/collection-sets";
import { Assets } from "@/utils/assets";
import { Sources } from "@/models/sources";
import { getJoiCollectionObject, getJoiPriceObject, JoiPrice } from "@/common/joi";
import * as Sdk from "@reservoir0x/sdk";
import { config } from "@/config/index";

const version = "v3";

export const getUserCollectionsV3Options: RouteOptions = {
  description: "User collections",
  notes:
    "Get aggregate stats for a user, grouped by collection. Useful for showing total portfolio information.",
  tags: ["api", "Collections"],
  plugins: {
    "hapi-swagger": {
      order: 3,
    },
  },
  validate: {
    params: Joi.object({
      user: Joi.string()
        .lowercase()
        .pattern(/^0x[a-fA-F0-9]{40}$/)
        .required()
        .description(
          "Filter to a particular user. Example: `0xF296178d553C8Ec21A2fBD2c5dDa8CA9ac905A00`"
        ),
    }),
    query: Joi.object({
      community: Joi.string()
        .lowercase()
        .description("Filter to a particular community. Example: `artblocks`"),
      collectionsSetId: Joi.string()
        .lowercase()
        .description(
          "Filter to a particular collection set. Example: `8daa732ebe5db23f267e58d52f1c9b1879279bcdf4f78b8fb563390e6946ea65`"
        ),
      collection: Joi.string()
        .lowercase()
        .description(
          "Filter to a particular collection with collection-id. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
      includeTopBid: Joi.boolean()
        .default(false)
        .description("If true, top bid will be returned in the response."),
      includeLiquidCount: Joi.boolean()
        .default(false)
        .description("If true, number of tokens with bids will be returned in the response."),
      excludeSpam: Joi.boolean()
        .default(false)
        .description("If true, will filter any collections marked as spam."),
      offset: Joi.number()
        .integer()
        .min(0)
        .max(10000)
        .default(0)
        .description("Use offset to request the next batch of items. Max is 10,000."),
      limit: Joi.number()
        .integer()
        .min(1)
        .max(100)
        .default(20)
        .description("Amount of items returned in response. max limit is 100."),
      displayCurrency: Joi.string()
        .lowercase()
        .pattern(regex.address)
        .description(
          "Input any ERC20 address to return result in given currency. Applies to `topBid` and `floorAsk`."
        ),
    }),
  },
  response: {
    schema: Joi.object({
      collections: Joi.array().items(
        Joi.object({
          collection: Joi.object({
            id: Joi.string().description("Collection Id"),
            slug: Joi.string().allow("", null),
            name: Joi.string().allow("", null),
            image: Joi.string().allow("", null),
            isSpam: Joi.boolean().default(false),
            banner: Joi.string().allow("", null),
            discordUrl: Joi.string().allow("", null),
            externalUrl: Joi.string().allow("", null),
            twitterUsername: Joi.string().allow("", null),
            twitterUrl: Joi.string().allow("", null),
            openseaVerificationStatus: Joi.string().allow("", null),
            description: Joi.string().allow("", null),
            metadataDisabled: Joi.boolean().default(false),
            sampleImages: Joi.array().items(Joi.string().allow("", null)),
            tokenCount: Joi.string().description("Total token count"),
            tokenSetId: Joi.string().allow(null),
            primaryContract: Joi.string()
              .lowercase()
              .pattern(/^0x[a-fA-F0-9]{40}$/),
            floorAskPrice: JoiPrice.allow(null).description("Current floor ask price"),
            topBidValue: JoiPrice.allow(null).description(
              "Top bid offer currently if offer is valid"
            ),
            topBidMaker: Joi.string()
              .lowercase()
              .pattern(/^0x[a-fA-F0-9]{40}$/)
              .allow(null),
            topBidSourceDomain: Joi.string().allow("", null),
            rank: Joi.object({
              "1day": Joi.number().unsafe().allow(null),
              "7day": Joi.number().unsafe().allow(null),
              "30day": Joi.number().unsafe().allow(null),
              allTime: Joi.number().unsafe().allow(null),
            }).description("Current rank based from overall volume"),
            volume: Joi.object({
              "1day": Joi.number().unsafe().allow(null),
              "7day": Joi.number().unsafe().allow(null),
              "30day": Joi.number().unsafe().allow(null),
              allTime: Joi.number().unsafe().allow(null),
            }).description("Total volume in given time period."),
            volumeChange: Joi.object({
              "1day": Joi.number().unsafe().allow(null),
              "7day": Joi.number().unsafe().allow(null),
              "30day": Joi.number().unsafe().allow(null),
            }).description(
              "Total volume change X-days vs previous X-days. (e.g. 7day [days 1-7] vs 7day prior [days 8-14]). A value over 1 is a positive gain, under 1 is a negative loss. e.g. 1 means no change; 1.1 means 10% increase; 0.9 means 10% decrease."
            ),
            floorSale: Joi.object({
              "1day": Joi.number().unsafe().allow(null),
              "7day": Joi.number().unsafe().allow(null),
              "30day": Joi.number().unsafe().allow(null),
            }).description("The floor sale from X-days ago."),
            contractKind: Joi.string()
              .allow("", null)
              .description("Returns `erc721`, `erc1155`, etc."),
          }),
          ownership: Joi.object({
            tokenCount: Joi.string(),
            onSaleCount: Joi.string(),
            liquidCount: Joi.string().optional(),
          }),
        })
      ),
    }).label(`getUserCollections${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-user-collections-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const params = request.params as any;
    const query = request.query as any;

    let liquidCount = "";
    let selectLiquidCount = "";
    if (query.includeLiquidCount) {
      selectLiquidCount = "SUM(owner_liquid_count) AS owner_liquid_count,";
      liquidCount = `
        LEFT JOIN LATERAL (
            SELECT 1 AS owner_liquid_count
            FROM "orders" "o"
            JOIN "token_sets_tokens" "tst" ON "o"."token_set_id" = "tst"."token_set_id"
            WHERE "tst"."contract" = nbsample."contract"
            AND "tst"."token_id" = nbsample."token_id"
            AND "o"."side" = 'buy'
            AND "o"."fillability_status" = 'fillable'
            AND "o"."approval_status" = 'approved'
            AND EXISTS(
              SELECT FROM "nft_balances" "nb"
                WHERE "nb"."contract" = nbsample."contract"
                AND "nb"."token_id" = nbsample."token_id"
                AND "nb"."amount" > 0
                AND "nb"."owner" != "o"."maker"
            )
            LIMIT 1
        ) "y" ON TRUE
      `;
    }

    try {
      let baseQuery = `
        WITH nbsample as (SELECT contract, token_id, "owner", amount
            FROM nft_balances
            WHERE "owner" = $/user/
              AND amount > 0
            ORDER BY last_token_appraisal_value DESC NULLS LAST
            LIMIT 50000
        ),
        token_images AS (
            SELECT tokens.collection_id, tokens.image,
                  ROW_NUMBER() OVER (PARTITION BY tokens.collection_id ORDER BY tokens.token_id) AS image_row_num
            FROM nbsample
            JOIN tokens ON nbsample.contract = tokens.contract AND nbsample.token_id = tokens.token_id
            WHERE tokens.image IS NOT NULL
        ),
        filtered_token_images AS (
            SELECT collection_id, array_agg(image) AS images
            FROM token_images
            WHERE image_row_num <= 4
            GROUP BY collection_id
        )
        SELECT  collections.id,
                collections.slug,
                collections.name,
                (collections.metadata ->> 'imageUrl')::TEXT AS "image",
                (collections.metadata ->> 'bannerImageUrl')::TEXT AS "banner",
                (collections.metadata ->> 'discordUrl')::TEXT AS "discord_url",
                (collections.metadata ->> 'description')::TEXT AS "description",
                (collections.metadata ->> 'externalUrl')::TEXT AS "external_url",
                (collections.metadata ->> 'twitterUsername')::TEXT AS "twitter_username",
                (collections.metadata ->> 'twitterUrl')::TEXT AS "twitter_url",
                (collections.metadata ->> 'safelistRequestStatus')::TEXT AS "opensea_verification_status",
                collections.contract,
                collections.token_set_id,
                collections.is_spam, 
                collections.token_count,
                collections.metadata_disabled,
                filtered_token_images.images AS sample_images,
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
                collections.floor_sell_value,
                collections.day1_floor_sell_value,
                collections.day7_floor_sell_value,
                collections.day30_floor_sell_value,
                SUM(COALESCE(nbsample.amount, 0)) AS owner_token_count,
                ${selectLiquidCount}
                SUM(CASE WHEN tokens.floor_sell_value IS NULL THEN 0 ELSE 1 END) AS owner_on_sale_count,
                (SELECT orders.currency FROM orders WHERE orders.id = collections.floor_sell_id) AS floor_sell_currency,                
                (SELECT orders.currency_price FROM orders WHERE orders.id = collections.floor_sell_id) AS floor_sell_currency_price,
                (SELECT orders.currency FROM orders WHERE orders.id = collections.top_buy_id) AS top_buy_currency,
                (SELECT orders.currency_price FROM orders WHERE orders.id = collections.top_buy_id) AS top_buy_currency_price,
                (SELECT contracts.kind FROM contracts WHERE contracts.address = collections.contract) AS contract_kind
        FROM nbsample 
        JOIN tokens ON nbsample.contract = tokens.contract AND nbsample.token_id = tokens.token_id
        ${liquidCount}
        JOIN collections ON tokens.collection_id = collections.id
        LEFT JOIN filtered_token_images ON collections.id = filtered_token_images.collection_id
      `;

      // Filters
      (params as any).user = toBuffer(params.user);
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

      if (query.collection) {
        conditions.push(`collections.id = $/collection/`);
      }

      if (query.excludeSpam) {
        conditions.push(`(collections.is_spam IS NULL OR collections.is_spam <= 0)`);
      }

      if (conditions.length) {
        baseQuery += " WHERE " + conditions.map((c) => `(${c})`).join(" AND ");
      }

      // Grouping
      baseQuery += ` GROUP BY collections.id, nbsample.owner, filtered_token_images.images`;

      // Sorting
      baseQuery += ` ORDER BY collections.all_time_volume DESC`;

      // Pagination
      baseQuery += ` OFFSET $/offset/`;
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

        topBidQuery = `LEFT JOIN LATERAL (
          SELECT
            ts.top_buy_id,
            ts.top_buy_value,
            o.source_id_int AS top_buy_source_id_int,
            ts.top_buy_maker
          FROM token_sets ts
          LEFT JOIN orders o ON ts.top_buy_id = o.id
          WHERE ts.id = x.token_set_id
          ORDER BY ts.top_buy_value DESC NULLS LAST
          LIMIT 1
        ) y ON TRUE`;
      }

      baseQuery = `
        WITH x AS (${baseQuery})
        SELECT *
        FROM x
        ${topBidQuery}
      `;

      const result = await redb.manyOrNone(baseQuery, { ...params, ...query });
      const sources = await Sources.getInstance();

      const collections = _.map(result, async (r) => {
        const response = {
          collection: getJoiCollectionObject(
            {
              id: r.id,
              slug: r.slug,
              name: r.name,
              image:
                Assets.getLocalAssetsLink(r.image) ||
                (r.sample_images?.length ? Assets.getLocalAssetsLink(r.sample_images[0]) : null),
              isSpam: Number(r.is_spam) > 0,
              banner: r.banner,
              twitterUrl: r.twitter_url,
              discordUrl: r.discord_url,
              externalUrl: r.external_url,
              twitterUsername: r.twitter_username,
              openseaVerificationStatus: r.opensea_verification_status,
              description: r.description,
              metadataDisabled: Boolean(Number(r.metadata_disabled)),
              sampleImages: Assets.getLocalAssetsLink(r.sample_images) || [],
              tokenCount: String(r.token_count),
              primaryContract: fromBuffer(r.contract),
              tokenSetId: r.token_set_id,
              floorAskPrice: r.floor_sell_value
                ? await getJoiPriceObject(
                    {
                      gross: {
                        amount: String(r.floor_sell_currency_price ?? r.floor_sell_value),
                        nativeAmount: String(r.floor_sell_value),
                      },
                    },
                    fromBuffer(r.floor_sell_currency),
                    query.displayCurrency
                  )
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
              contractKind: r.contract_kind,
            },
            r.metadata_disabled
          ),
          ownership: {
            tokenCount: String(r.owner_token_count),
            onSaleCount: String(r.owner_on_sale_count),
            liquidCount: query.includeLiquidCount
              ? String(Number(r.owner_liquid_count))
              : undefined,
          },
        };

        if (query.includeTopBid) {
          (response as any).collection.topBidValue = r.top_buy_value
            ? await getJoiPriceObject(
                {
                  gross: {
                    amount: String(r.top_buy_currency_price ?? r.top_buy_value),
                    nativeAmount: String(r.top_buy_value),
                  },
                },
                r.top_buy_currency
                  ? fromBuffer(r.top_buy_currency)
                  : Sdk.Common.Addresses.Native[config.chainId],
                query.displayCurrency
              )
            : undefined;

          (response as any).collection.topBidMaker = r.top_buy_maker
            ? fromBuffer(r.top_buy_maker)
            : null;

          (response as any).collection.topBidSourceDomain = r.top_buy_source_id_int
            ? sources.get(r.top_buy_source_id_int)?.domain
            : null;
        }

        return response;
      });

      return { collections: await Promise.all(collections) };
    } catch (error) {
      logger.error(`get-user-collections-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
