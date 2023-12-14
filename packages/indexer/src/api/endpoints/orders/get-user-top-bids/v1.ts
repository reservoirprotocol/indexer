/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { redbAlt } from "@/common/db";
import { logger } from "@/common/logger";
import {
  buildContinuation,
  formatEth,
  fromBuffer,
  splitContinuation,
  toBuffer,
} from "@/common/utils";
import { Sources } from "@/models/sources";
import { Assets, ImageSize } from "@/utils/assets";
import _ from "lodash";
import { JoiAttributeKeyValueObject, JoiSource, getJoiSourceObject } from "@/common/joi";

const version = "v1";

export const getUserTopBidsV1Options: RouteOptions = {
  description: "User Top Bids",
  notes: "Return the top bids for the given user tokens",
  tags: ["api", "x-deprecated"],
  plugins: {
    "hapi-swagger": {
      order: 7,
    },
  },
  validate: {
    params: Joi.object({
      user: Joi.string()
        .lowercase()
        .pattern(/^0x[a-fA-F0-9]{40}$/)
        .description(
          "Filter to a particular user. Example: `0xF296178d553C8Ec21A2fBD2c5dDa8CA9ac905A00`"
        ),
    }),
    query: Joi.object({
      collection: Joi.alternatives(
        Joi.string().lowercase(),
        Joi.array().items(Joi.string().lowercase())
      ).description(
        "Filter to one or more collections. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
      ),
      community: Joi.string()
        .lowercase()
        .description("Filter to a particular community. Example: `artblocks`"),
      optimizeCheckoutURL: Joi.boolean()
        .default(false)
        .description(
          "If true, urls will only be returned for optimized sources that support royalties."
        ),
      normalizeRoyalties: Joi.boolean()
        .default(false)
        .description("If true, prices will include missing royalties to be added on-top."),
      continuation: Joi.string().description(
        "Use continuation token to request next offset of items."
      ),
      sortBy: Joi.string()
        .valid("topBidValue", "dateCreated", "orderExpiry", "floorDifferencePercentage")
        .default("topBidValue")
        .description("Order of the items are returned in the response."),
      sortDirection: Joi.string().lowercase().valid("asc", "desc").default("desc"),
      limit: Joi.number()
        .integer()
        .min(1)
        .max(20)
        .default(20)
        .description("Amount of items returned in response."),
    }),
  },
  response: {
    schema: Joi.object({
      totalTokensWithBids: Joi.number(),
      topBids: Joi.array().items(
        Joi.object({
          id: Joi.string(),
          price: Joi.number().unsafe(),
          value: Joi.number().unsafe(),
          maker: Joi.string()
            .lowercase()
            .pattern(/^0x[a-fA-F0-9]{40}$/),
          createdAt: Joi.string(),
          validFrom: Joi.number().unsafe(),
          validUntil: Joi.number().unsafe(),
          floorDifferencePercentage: Joi.number().unsafe(),
          source: JoiSource.allow(null),
          feeBreakdown: Joi.array()
            .items(
              Joi.object({
                kind: Joi.string(),
                recipient: Joi.string().allow("", null),
                bps: Joi.number(),
              })
            )
            .allow(null),
          context: Joi.alternatives(
            Joi.object({
              kind: "token",
              data: Joi.object({
                collectionName: Joi.string().allow("", null),
                tokenName: Joi.string().allow("", null),
                image: Joi.string().allow("", null),
              }),
            }),
            Joi.object({
              kind: "collection",
              data: Joi.object({
                collectionName: Joi.string().allow("", null),
                image: Joi.string().allow("", null),
              }),
            }),
            Joi.object({
              kind: "attribute",
              data: Joi.object({
                collectionName: Joi.string().allow("", null),
                attributes: Joi.array().items(JoiAttributeKeyValueObject),
                image: Joi.string().allow("", null),
              }),
            })
          ).allow(null),
          token: Joi.object({
            contract: Joi.string(),
            tokenId: Joi.string(),
            name: Joi.string().allow("", null),
            image: Joi.string().allow("", null),
            floorAskPrice: Joi.number().unsafe().allow(null),
            lastSalePrice: Joi.number().unsafe().allow(null),
            collection: Joi.object({
              id: Joi.string().allow(null),
              name: Joi.string().allow("", null),
              imageUrl: Joi.string().allow("", null),
              floorAskPrice: Joi.number().unsafe().allow(null),
            }),
          }),
        })
      ),
      continuation: Joi.string().allow(null),
    }).label(`getUserTopBids${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-user-top-bids-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const params = request.params as any;
    const query = request.query as any;
    let collectionFilter = "";
    let communityFilter = "";
    let sortField = "top_bid_value";
    let offset = 0;

    // Set the user value for the query
    (query as any).user = toBuffer(params.user);

    switch (query.sortBy) {
      case "dateCreated":
        sortField = "order_created_at";
        break;

      case "orderExpiry":
        sortField = "top_bid_valid_until";
        break;

      case "floorDifferencePercentage":
        sortField = "floor_difference_percentage";
        break;

      case "topBidValue":
      default:
        break;
    }

    if (query.continuation) {
      offset = Number(splitContinuation(query.continuation));
    }

    if (query.collection) {
      if (Array.isArray(query.collection)) {
        collectionFilter = `AND id IN ($/collection:csv/)`;
      } else {
        collectionFilter = `AND id = $/collection/`;
      }
    }

    if (query.community) {
      communityFilter = `AND community = $/community/`;
    }

    try {
      const baseQuery = `
        SELECT nb.contract, y.*, t.*, c.*, count(*) OVER() AS "total_tokens_with_bids",
               (
                CASE
                  WHEN y.token_set_id LIKE 'token:%' THEN
                      json_build_object(
                        'kind', 'token',
                        'data', json_build_object(
                          'collectionName', c.collection_name,
                          'tokenName', t.name,
                          'image', t.image
                        )
                      )
      
                  WHEN y.token_set_id LIKE 'contract:%' THEN
                      json_build_object(
                        'kind', 'collection',
                        'data', json_build_object(
                          'collectionName', c.collection_name,
                          'image', (c.collection_metadata ->> 'imageUrl')::TEXT
                        )
                      )
      
                  WHEN y.token_set_id LIKE 'range:%' THEN
                      json_build_object(
                        'kind', 'collection',
                        'data', json_build_object(
                          'collectionName', c.collection_name,
                          'image', (c.collection_metadata ->> 'imageUrl')::TEXT
                        )
                      )
                     
                  WHEN y.token_set_id LIKE 'list:%' THEN
                    (SELECT
                      CASE
                        WHEN token_sets.attribute_id IS NULL THEN
                          (SELECT
                            json_build_object(
                              'kind', 'collection',
                              'data', json_build_object(
                                'collectionName', collections.name,
                                'image', (collections.metadata ->> 'imageUrl')::TEXT
                              )
                            )
                          FROM collections
                          WHERE token_sets.collection_id = collections.id)
                        ELSE
                          (SELECT
                            json_build_object(
                              'kind', 'attribute',
                              'data', json_build_object(
                                'collectionName', collections.name,
                                'attributes', ARRAY[json_build_object('key', attribute_keys.key, 'value', attributes.value)],
                                'image', (collections.metadata ->> 'imageUrl')::TEXT
                              )
                            )
                          FROM attributes
                          JOIN attribute_keys
                            ON attributes.attribute_key_id = attribute_keys.id
                          JOIN collections
                            ON attribute_keys.collection_id = collections.id
                          WHERE token_sets.attribute_id = attributes.id)
                      END  
                   FROM token_sets
                   WHERE token_sets.id = y.token_set_id
                   AND token_sets.schema_hash = y.token_set_schema_hash) 
                  ELSE NULL
                END
              ) AS bid_context,
              COALESCE(((top_bid_value / net_listing) - 1) * 100, 0) AS floor_difference_percentage
        FROM nft_balances nb
        JOIN LATERAL (
            SELECT o.token_set_id, o.id AS "top_bid_id", o.price AS "top_bid_price", o.value AS "top_bid_value",
                   o.maker AS "top_bid_maker", source_id_int, o.created_at "order_created_at", o.token_set_schema_hash,
                   extract(epoch from o.created_at) * 1000000 AS "order_created_at_micro",
                   DATE_PART('epoch', LOWER(o.valid_between)) AS "top_bid_valid_from", o.fee_breakdown,
                   COALESCE(
                     NULLIF(DATE_PART('epoch', UPPER(o.valid_between)), 'Infinity'),
                     0
                   ) AS "top_bid_valid_until"
            FROM orders o
            JOIN token_sets_tokens tst ON o.token_set_id = tst.token_set_id
            WHERE tst.contract = nb.contract
            AND tst.token_id = nb.token_id
            AND o.side = 'buy'
            AND o.fillability_status = 'fillable'
            AND o.approval_status = 'approved'
            AND o.maker != $/user/
            ORDER BY o.value DESC
            LIMIT 1
        ) y ON TRUE
        LEFT JOIN LATERAL (
            SELECT t.token_id,t.image_version, t.name, t.image, t.collection_id, floor_sell_value AS "token_floor_sell_value", last_sell_value AS "token_last_sell_value"
            FROM tokens t
            WHERE t.contract = nb.contract
            AND t.token_id = nb.token_id
        ) t ON TRUE
        ${query.collection || query.community ? "" : "LEFT"} JOIN LATERAL (
            SELECT id AS "collection_id", name AS "collection_name", metadata AS "collection_metadata", floor_sell_value AS "collection_floor_sell_value",
                   (floor_sell_value * (1-((COALESCE(royalties_bps, 0)::float + 250) / 10000)))::numeric(78, 0) AS "net_listing", image_version AS "collection_image_version"
            FROM collections c
            WHERE id = t.collection_id
            ${communityFilter}
            ${collectionFilter}
        ) c ON TRUE
        WHERE owner = $/user/
        AND amount > 0
        ORDER BY ${sortField} ${query.sortDirection}, token_id ${query.sortDirection}
        OFFSET ${offset} LIMIT $/limit/
      `;

      const sources = await Sources.getInstance();

      const bids = await redbAlt.manyOrNone(baseQuery, query);
      let totalTokensWithBids = 0;

      const results = bids.map((r) => {
        const contract = fromBuffer(r.contract);
        const tokenId = r.token_id;
        totalTokensWithBids = Number(r.total_tokens_with_bids);

        const source = sources.get(
          Number(r.source_id_int),
          contract,
          tokenId,
          query.optimizeCheckoutURL
        );

        return {
          id: r.top_bid_id,
          price: formatEth(r.top_bid_price),
          value: formatEth(r.top_bid_value),
          maker: fromBuffer(r.top_bid_maker),
          createdAt: new Date(r.order_created_at).toISOString(),
          validFrom: r.top_bid_valid_from,
          validUntil: r.top_bid_valid_until,
          floorDifferencePercentage: _.round(r.floor_difference_percentage || 0, 2),
          source: getJoiSourceObject(source),
          feeBreakdown: r.fee_breakdown,
          context: r.bid_context,
          token: {
            contract: contract,
            tokenId: tokenId,
            name: r.name,
            image: Assets.getResizedImageUrl(r.image, undefined, r.image_version),
            floorAskPrice: r.token_floor_sell_value ? formatEth(r.token_floor_sell_value) : null,
            lastSalePrice: r.token_last_sell_value ? formatEth(r.token_last_sell_value) : null,
            collection: {
              id: r.collection_id,
              name: r.collection_name,
              imageUrl: Assets.getResizedImageUrl(
                r.collection_metadata?.imageUrl,
                ImageSize.small,
                r.collection_image_version
              ),
              floorAskPrice: r.collection_floor_sell_value
                ? formatEth(r.collection_floor_sell_value)
                : null,
            },
          },
        };
      });

      let continuation: string | null = null;
      if (bids.length >= query.limit) {
        continuation = offset + query.limit;
      }

      return {
        totalTokensWithBids,
        topBids: results,
        continuation: continuation ? buildContinuation(continuation.toString()) : undefined,
      };
    } catch (error) {
      logger.error(`get-user-top-bids-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
