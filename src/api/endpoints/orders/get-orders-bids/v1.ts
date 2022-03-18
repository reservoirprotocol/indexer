/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { edb } from "@/common/db";
import { logger } from "@/common/logger";
import { formatEth, fromBuffer, toBuffer } from "@/common/utils";

const version = "v1";

export const getOrdersBidsV1Options: RouteOptions = {
  description: "Bulk bids access",
  notes:
    "This API is designed for efficiently ingesting large volumes of orders, for external processing",
  tags: ["api", "4. NFT API"],
  plugins: {
    "hapi-swagger": {
      order: 42,
    },
  },
  validate: {
    query: Joi.object({
      token: Joi.string()
        .lowercase()
        .pattern(/^0x[a-f0-9]{40}:\d+$/),
      tokenSetId: Joi.string()
        .lowercase()
        .description(
          "Filter to a particular set, e.g. `contract:0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
      maker: Joi.string()
        .lowercase()
        .pattern(/^0x[a-f0-9]{40}$/),
      status: Joi.string().valid("active", "inactive", "expired"),
      continuation: Joi.string().pattern(/^\d+(.\d+)?_0x[a-f0-9]{64}$/),
      limit: Joi.number().integer().min(1).max(1000).default(50),
    })
      .or("token", "tokenSetId", "maker")
      .oxor("token", "tokenSetId", "maker")
      .with("status", "maker"),
  },
  response: {
    schema: Joi.object({
      orders: Joi.array().items(
        Joi.object({
          id: Joi.string().required(),
          kind: Joi.string().required(),
          side: Joi.string().valid("buy", "sell").required(),
          fillabilityStatus: Joi.string().required(),
          approvalStatus: Joi.string().required(),
          tokenSetId: Joi.string().required(),
          tokenSetSchemaHash: Joi.string()
            .lowercase()
            .pattern(/^0x[a-f0-9]{64}$/)
            .required(),
          maker: Joi.string()
            .lowercase()
            .pattern(/^0x[a-f0-9]{40}$/)
            .required(),
          taker: Joi.string()
            .lowercase()
            .pattern(/^0x[a-f0-9]{40}$/)
            .required(),
          price: Joi.number().unsafe().required(),
          value: Joi.number().unsafe().required(),
          validFrom: Joi.number().required(),
          validUntil: Joi.number().required(),
          sourceId: Joi.string()
            .pattern(/^0x[a-f0-9]{40}$/)
            .allow(null),
          feeBps: Joi.number().allow(null),
          feeBreakdown: Joi.array()
            .items(
              Joi.object({
                kind: Joi.string(),
                recipient: Joi.string()
                  .pattern(/^0x[a-f0-9]{40}$/)
                  .allow(null),
                bps: Joi.number(),
              })
            )
            .allow(null),
          expiration: Joi.number().required(),
          createdAt: Joi.string().required(),
          updatedAt: Joi.string().required(),
          rawData: Joi.any(),
        })
      ),
      continuation: Joi.string()
        .pattern(/^\d+(.\d+)?_0x[a-f0-9]{64}$/)
        .allow(null),
    }).label(`getOrdersBids${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(
        `get-orders-bids-${version}-handler`,
        `Wrong response schema: ${error}`
      );
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      let baseQuery = `
        SELECT
          "o"."id",
          "o"."kind",
          "o"."side",
          "o"."fillability_status",
          "o"."approval_status",
          "o"."token_set_id",
          "o"."token_set_schema_hash",
          "o"."maker",
          "o"."taker",
          "o"."price",
          "o"."value",
          DATE_PART('epoch', LOWER("o"."valid_between")) AS "valid_from",
          COALESCE(
            NULLIF(DATE_PART('epoch', UPPER("o"."valid_between")), 'Infinity'),
            0
          ) AS "valid_until",
          "o"."source_id",
          "o"."fee_bps",
          "o"."fee_breakdown",
          COALESCE(
            NULLIF(DATE_PART('epoch', "o"."expiration"), 'Infinity'),
            0
          ) AS "expiration",
          extract(epoch from "o"."created_at") AS "created_at",
          "o"."updated_at",
          "o"."raw_data"
        FROM "orders" "o"
      `;

      // Filters
      const conditions: string[] = [`"o"."side" = 'buy'`];
      if (query.token || query.tokenSetId) {
        // Valid orders
        conditions.push(
          `"o"."fillability_status" = 'fillable' AND "o"."approval_status" = 'approved'`
        );

        if (query.token) {
          (query as any).tokenSetId = `token:${query.token}`;
        }
        conditions.push(`"o"."token_set_id" = $/tokenSetId/`);
      }
      if (query.maker) {
        switch (query.status) {
          case "inactive": {
            // Potentially-valid orders
            conditions.push(
              `"o"."fillability_status" = 'no-balance' OR ("o"."fillability_status" = 'fillable' AND "o"."approval_status" != 'approved')`
            );
            break;
          }

          case "expired": {
            // Invalid orders
            conditions.push(
              `"o"."fillability_status" != 'fillable' AND "o"."fillability_status" != 'no-balance'`
            );
            break;
          }

          case "active":
          default: {
            // Valid orders
            conditions.push(
              `"o"."fillability_status" = 'fillable' AND "o"."approval_status" = 'approved'`
            );

            break;
          }
        }

        (query as any).maker = toBuffer(query.maker);
        conditions.push(`"o"."maker" = $/maker/`);
      }
      if (query.continuation) {
        const [createdAt, id] = query.continuation.split("_");
        (query as any).createdAt = createdAt;
        (query as any).id = id;

        conditions.push(
          `("o"."created_at", "o"."id") < (to_timestamp($/createdAt/), $/id/)`
        );
      }
      if (conditions.length) {
        baseQuery += " WHERE " + conditions.map((c) => `(${c})`).join(" AND ");
      }

      // Sorting
      baseQuery += ` ORDER BY "o"."created_at" DESC, "o"."id" DESC`;

      // Pagination
      baseQuery += ` LIMIT $/limit/`;

      const rawResult = await edb.manyOrNone(baseQuery, query);

      let continuation = null;
      if (rawResult.length === query.limit) {
        continuation =
          rawResult[rawResult.length - 1].created_at +
          "_" +
          rawResult[rawResult.length - 1].id;
      }

      const result = rawResult.map((r) => ({
        id: r.id,
        kind: r.kind,
        side: r.side,
        fillabilityStatus: r.fillability_status,
        approvalStatus: r.approval_status,
        tokenSetId: r.token_set_id,
        tokenSetSchemaHash: fromBuffer(r.token_set_schema_hash),
        maker: fromBuffer(r.maker),
        taker: fromBuffer(r.taker),
        price: formatEth(r.price),
        // For consistency, we set the value of "sell" orders as price - fee
        value:
          r.side === "buy"
            ? formatEth(r.value)
            : formatEth(r.value) -
              (formatEth(r.value) * Number(r.fee_bps)) / 10000,
        validFrom: Number(r.valid_from),
        validUntil: Number(r.valid_until),
        sourceId: r.source_id ? fromBuffer(r.source_id) : null,
        feeBps: Number(r.fee_bps),
        feeBreakdown: r.fee_breakdown,
        expiration: Number(r.expiration),
        createdAt: new Date(r.created_at * 1000).toISOString(),
        updatedAt: new Date(r.updated_at).toISOString(),
        rawData: r.raw_data,
      }));

      return {
        orders: result,
        continuation,
      };
    } catch (error) {
      logger.error(
        `get-orders-bids-${version}-handler`,
        `Handler failure: ${error}`
      );
      throw error;
    }
  },
};
