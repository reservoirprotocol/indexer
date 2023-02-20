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
  regex,
  toBuffer,
} from "@/common/utils";
import { Sources } from "@/models/sources";
import { JoiOrderCriteria } from "@/common/joi";

const version = "v1";

export const getBidEventsV1Options: RouteOptions = {
  cache: {
    privacy: "public",
    expiresIn: 5000,
  },
  description: "Bid status changes",
  notes: "Get updates any time a bid status changes",
  tags: ["api", "x-deprecated"],
  plugins: {
    "hapi-swagger": {
      deprecated: true,
    },
  },
  validate: {
    query: Joi.object({
      contract: Joi.string()
        .lowercase()
        .pattern(regex.address)
        .description(
          "Filter to a particular contract. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
      startTimestamp: Joi.number().description(
        "Get events after a particular unix timestamp (inclusive)"
      ),
      endTimestamp: Joi.number().description(
        "Get events before a particular unix timestamp (inclusive)"
      ),
      includeCriteria: Joi.boolean()
        .default(false)
        .description("If true, bid criteria is included in the response."),
      sortDirection: Joi.string()
        .valid("asc", "desc")
        .default("desc")
        .description("Order the items are returned in the response."),
      continuation: Joi.string()
        .pattern(regex.base64)
        .description("Use continuation token to request next offset of items."),
      limit: Joi.number()
        .integer()
        .min(1)
        .max(1000)
        .default(50)
        .description("Amount of items returned in response."),
    }).oxor("contract"),
  },
  response: {
    schema: Joi.object({
      events: Joi.array().items(
        Joi.object({
          bid: Joi.object({
            id: Joi.string(),
            status: Joi.string(),
            contract: Joi.string().lowercase().pattern(regex.address),
            tokenSetId: Joi.string(),
            maker: Joi.string().lowercase().pattern(regex.address).allow(null),
            price: Joi.number().unsafe().allow(null),
            value: Joi.number().unsafe().allow(null),
            quantityRemaining: Joi.number().unsafe(),
            nonce: Joi.string().pattern(regex.number).allow(null),
            validFrom: Joi.number().unsafe().allow(null),
            validUntil: Joi.number().unsafe().allow(null),
            source: Joi.string().allow("", null),
            criteria: JoiOrderCriteria.allow(null),
          }),
          event: Joi.object({
            id: Joi.number().unsafe(),
            kind: Joi.string().valid(
              "new-order",
              "expiry",
              "sale",
              "cancel",
              "balance-change",
              "approval-change",
              "bootstrap",
              "revalidation",
              "reprice"
            ),
            txHash: Joi.string().lowercase().pattern(regex.bytes32).allow(null),
            txTimestamp: Joi.number().allow(null),
            createdAt: Joi.string(),
          }),
        })
      ),
      continuation: Joi.string().pattern(regex.base64).allow(null),
    }).label(`getBidEvents${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-bid-events-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      const criteriaBuildQuery = `
        (
          CASE
            WHEN bid_events.token_set_id LIKE 'token:%' THEN
              (SELECT
                json_build_object(
                  'kind', 'token',
                  'data', json_build_object(
                    'token', json_build_object(
                      'tokenId', tokens.token_id::TEXT,
                      'name', tokens.name,
                      'image', tokens.image
                    ),
                    'collection', json_build_object(
                      'id', collections.id,
                      'name', collections.name,
                      'image', (collections.metadata ->> 'imageUrl')::TEXT
                    )
                  )
                )
              FROM tokens
              JOIN collections
                ON tokens.collection_id = collections.id
              WHERE tokens.contract = decode(substring(split_part(bid_events.token_set_id, ':', 2) from 3), 'hex')
                AND tokens.token_id = (split_part(bid_events.token_set_id, ':', 3)::NUMERIC(78, 0)))

            WHEN bid_events.token_set_id LIKE 'contract:%' THEN
              (SELECT
                json_build_object(
                  'kind', 'collection',
                  'data', json_build_object(
                    'collection', json_build_object(
                      'id', collections.id,
                      'name', collections.name,
                      'image', (collections.metadata ->> 'imageUrl')::TEXT
                    )
                  )
                )
              FROM collections
              WHERE collections.id = substring(bid_events.token_set_id from 10))

            WHEN bid_events.token_set_id LIKE 'range:%' THEN
              (SELECT
                json_build_object(
                  'kind', 'collection',
                  'data', json_build_object(
                    'collection', json_build_object(
                      'id', collections.id,
                      'name', collections.name,
                      'image', (collections.metadata ->> 'imageUrl')::TEXT
                    )
                  )
                )
              FROM collections
              WHERE collections.id = substring(bid_events.token_set_id from 7))

            WHEN bid_events.token_set_id LIKE 'list:%' THEN
              (SELECT
                CASE
                  WHEN token_sets.attribute_id IS NULL THEN
                    (SELECT
                      json_build_object(
                        'kind', 'collection',
                        'data', json_build_object(
                          'collection', json_build_object(
                            'id', collections.id,
                            'name', collections.name,
                            'image', (collections.metadata ->> 'imageUrl')::TEXT
                          )
                        )
                      )
                    FROM collections
                    WHERE token_sets.collection_id = collections.id)
                  ELSE
                    (SELECT
                      json_build_object(
                        'kind', 'attribute',
                        'data', json_build_object(
                          'collection', json_build_object(
                            'id', collections.id,
                            'name', collections.name,
                            'image', (collections.metadata ->> 'imageUrl')::TEXT
                          ),
                          'attribute', json_build_object('key', attribute_keys.key, 'value', attributes.value)
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
              WHERE token_sets.id = bid_events.token_set_id
              LIMIT 1)
            ELSE NULL
          END
        ) AS criteria
      `;

      let baseQuery = `
        SELECT
          bid_events.id,
          bid_events.kind,
          bid_events.status,
          bid_events.contract,
          bid_events.token_set_id,
          bid_events.order_id,
          bid_events.order_quantity_remaining,
          bid_events.order_nonce,
          bid_events.maker,
          bid_events.price,
          bid_events.value,
          bid_events.order_source_id_int,
          coalesce(
            nullif(date_part('epoch', upper(bid_events.order_valid_between)), 'Infinity'),
            0
          ) AS valid_until,
          date_part('epoch', lower(bid_events.order_valid_between)) AS valid_from,
          bid_events.tx_hash,
          bid_events.tx_timestamp,
          extract(epoch from bid_events.created_at) AS created_at
          ${query.includeCriteria ? `, ${criteriaBuildQuery}` : ""}
        FROM bid_events
      `;

      // We default in the code so that these values don't appear in the docs
      if (!query.startTimestamp) {
        query.startTimestamp = 0;
      }
      if (!query.endTimestamp) {
        query.endTimestamp = 9999999999;
      }

      // Filters
      const conditions: string[] = [
        `bid_events.created_at >= to_timestamp($/startTimestamp/)`,
        `bid_events.created_at <= to_timestamp($/endTimestamp/)`,
      ];
      if (query.contract) {
        (query as any).contract = toBuffer(query.contract);
        conditions.push(`bid_events.contract = $/contract/`);
      }
      if (query.continuation) {
        const [createdAt, id] = splitContinuation(query.continuation, /^\d+(.\d+)?_\d+$/);
        (query as any).createdAt = createdAt;
        (query as any).id = id;

        conditions.push(
          `(bid_events.created_at, bid_events.id) ${
            query.sortDirection === "asc" ? ">" : "<"
          } (to_timestamp($/createdAt/), $/id/)`
        );
      }
      if (conditions.length) {
        baseQuery += " WHERE " + conditions.map((c) => `(${c})`).join(" AND ");
      }

      // Sorting
      baseQuery += `
        ORDER BY
          bid_events.created_at ${query.sortDirection},
          bid_events.id ${query.sortDirection}
      `;

      // Pagination
      baseQuery += ` LIMIT $/limit/`;

      const rawResult = await redb.manyOrNone(baseQuery, query);

      let continuation = null;
      if (rawResult.length === query.limit) {
        continuation = buildContinuation(
          rawResult[rawResult.length - 1].created_at + "_" + rawResult[rawResult.length - 1].id
        );
      }

      const sources = await Sources.getInstance();
      const result = rawResult.map((r) => ({
        bid: {
          id: r.order_id,
          status: r.status,
          contract: fromBuffer(r.contract),
          tokenSetId: r.token_set_id,
          maker: r.maker ? fromBuffer(r.maker) : null,
          price: r.price ? formatEth(r.price) : null,
          value: r.value ? formatEth(r.value) : null,
          quantityRemaining: Number(r.order_quantity_remaining),
          nonce: r.order_nonce ?? null,
          validFrom: r.valid_from ? Number(r.valid_from) : null,
          validUntil: r.valid_until ? Number(r.valid_until) : null,
          source: sources.get(r.order_source_id_int)?.name,
          criteria: query.includeCriteria ? r.criteria : undefined,
        },
        event: {
          id: r.id,
          kind: r.kind,
          txHash: r.tx_hash ? fromBuffer(r.tx_hash) : null,
          txTimestamp: r.tx_timestamp ? Number(r.tx_timestamp) : null,
          createdAt: new Date(r.created_at * 1000).toISOString(),
        },
      }));

      return {
        events: result,
        continuation,
      };
    } catch (error) {
      logger.error(`get-bid-events-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
