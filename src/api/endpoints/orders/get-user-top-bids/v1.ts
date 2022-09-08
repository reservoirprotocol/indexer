/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import {
  buildContinuation,
  formatEth,
  fromBuffer,
  splitContinuation,
  toBuffer,
} from "@/common/utils";
import { Sources } from "@/models/sources";
import _ from "lodash";

const version = "v1";

export const getUserTopBidsV1Options: RouteOptions = {
  description: "User Top Bids",
  notes: "Return the top bids for the given user tokens",
  tags: ["api", "Orders"],
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
      continuation: Joi.string().description(
        "Use continuation token to request next offset of items."
      ),
      sortBy: Joi.string()
        .valid("topBidValue", "dateCreated", "orderExpiry")
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
          source: Joi.object().allow(null),
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
                attributes: Joi.array().items(
                  Joi.object({ key: Joi.string(), value: Joi.string() })
                ),
                image: Joi.string().allow("", null),
              }),
            })
          ).allow(null),
          token: Joi.object({
            contract: Joi.string(),
            tokenId: Joi.string(),
            name: Joi.string().allow(null, ""),
            image: Joi.string().allow(null, ""),
            collection: Joi.object({
              id: Joi.string().allow(null),
              name: Joi.string().allow(null, ""),
              imageUrl: Joi.string().allow(null),
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
    let continuationFilter = "";
    let sortField = "top_bid_value";

    // Set the user value for the query
    (query as any).user = toBuffer(params.user);

    switch (query.sortBy) {
      case "dateCreated":
        sortField = "order_created_at";

        if (query.continuation) {
          const contArr = splitContinuation(query.continuation)[0].split("_");

          const sign = query.sortDirection == "desc" ? "<" : ">";
          query.contColumn = Number(contArr[0]);
          query.contTokenId = contArr[1];
          continuationFilter = `AND (extract(epoch from order_created_at) * 1000000, t.token_id) ${sign} ($/contColumn/, $/contTokenId/)`;
        }
        break;

      case "orderExpiry":
        sortField = "top_bid_valid_until";

        if (query.continuation) {
          const contArr = splitContinuation(query.continuation)[0].split("_");

          const sign = query.sortDirection == "desc" ? "<" : ">";
          query.contColumn = Number(contArr[0]);
          query.contTokenId = contArr[1];
          continuationFilter = `AND (top_bid_valid_until, t.token_id) ${sign} ($/contColumn/, $/contTokenId/)`;
        }
        break;

      case "topBidValue":
      default:
        if (query.continuation) {
          const contArr = splitContinuation(query.continuation)[0].split("_");

          const sign = query.sortDirection == "desc" ? "<" : ">";
          query.contColumn = Number(contArr[0]);
          query.contTokenId = contArr[1];
          continuationFilter = `AND (top_bid_value, t.token_id) ${sign} ($/contColumn/, $/contTokenId/)`;
        }
        break;
    }

    try {
      const baseQuery = `
        SELECT nb.contract, y.*, t.*, c.*,
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
                      json_build_object(
                        'kind', 'attribute',
                        'data', json_build_object(
                          'collectionName', c.collection_name,
                          'attributes', ARRAY[json_build_object('key', attribute_keys.key, 'value', attributes.value)],
                          'image', (c.collection_metadata ->> 'imageUrl')::TEXT
                        )
                      )
                    FROM token_sets
                    JOIN attributes ON token_sets.attribute_id = attributes.id
                    JOIN attribute_keys ON attributes.attribute_key_id = attribute_keys.id
                    WHERE token_sets.id = y.token_set_id)
                  ELSE NULL
                END
              ) AS bid_context
        FROM nft_balances nb
        JOIN LATERAL (
            SELECT o.token_set_id, o.id AS "top_bid_id", o.price AS "top_bid_price", o.value AS "top_bid_value",
                   o.maker AS "top_bid_maker", source_id_int, o.created_at "order_created_at",
                   extract(epoch from o.created_at) * 1000000 AS "order_created_at_micro",
                   DATE_PART('epoch', LOWER(o.valid_between)) AS "top_bid_valid_from",
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
            ORDER BY o.value DESC
            LIMIT 1
        ) y ON TRUE
        LEFT JOIN LATERAL (
            SELECT t.token_id, t.name, t.image, t.collection_id
            FROM tokens t
            WHERE t.contract = nb.contract
            AND t.token_id = nb.token_id
        ) t ON TRUE
        LEFT JOIN LATERAL (
            SELECT id AS "collection_id", name AS "collection_name", metadata AS "collection_metadata", floor_sell_value AS "collection_floor_sell_value"
            FROM collections c
            WHERE id = t.collection_id
        ) c ON TRUE
        WHERE owner = $/user/
        AND amount > 0
        ${continuationFilter}
        ORDER BY ${sortField} ${query.sortDirection}, token_id
        LIMIT $/limit/
      `;

      const sources = await Sources.getInstance();
      const bids = await redb.manyOrNone(baseQuery, query);

      const results = bids.map((r) => {
        const contract = fromBuffer(r.contract);
        const tokenId = r.token_id;

        const source = sources.get(Number(r.source_id_int), contract, tokenId);

        return {
          id: r.top_bid_id,
          price: formatEth(r.top_bid_price),
          value: formatEth(r.top_bid_value),
          maker: fromBuffer(r.top_bid_maker),
          createdAt: new Date(r.order_created_at).toISOString(),
          validFrom: r.top_bid_valid_from,
          validUntil: r.top_bid_valid_until,
          source: {
            id: source?.address,
            domain: source?.domain,
            name: source?.metadata.title || source?.name,
            icon: source?.metadata.icon,
            url: source?.metadata.url,
          },
          context: r.bid_context,
          token: {
            contract: contract,
            tokenId: tokenId,
            name: r.name,
            image: r.image,
            collection: {
              id: r.collection_id,
              name: r.collection_name,
              imageUrl: r.collection_metadata?.imageUrl,
              floorAskPrice: r.collection_floor_sell_value
                ? formatEth(r.collection_floor_sell_value)
                : null,
            },
          },
        };
      });

      let continuation: string | null = null;
      if (bids.length >= query.limit) {
        const lastBid = _.last(bids);
        if (lastBid) {
          switch (query.sortBy) {
            case "dateCreated":
              continuation = lastBid.order_created_at_micro;
              break;

            case "orderExpiry":
              continuation = lastBid.top_bid_valid_until;
              break;

            case "topBidValue":
            default:
              continuation = lastBid.top_bid_value;
              break;
          }

          continuation += "_" + lastBid.token_id;
        }
      }

      return {
        topBids: results,
        continuation: continuation ? buildContinuation(continuation.toString()) : undefined,
      };
    } catch (error) {
      logger.error(`get-user-top-bids-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
