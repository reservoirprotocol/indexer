/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { formatEth, fromBuffer, toBuffer } from "@/common/utils";
import { Sources } from "@/models/sources";

const version = "v2";

export const getOrdersV2Options: RouteOptions = {
  description: "Submit order batch",
  notes:
    "Access orders with various filters applied. If you need orders created by a single user, use the positions API instead.",
  tags: ["api", "x-deprecated"],
  plugins: {
    "hapi-swagger": {
      deprecated: true,
    },
  },
  validate: {
    query: Joi.object({
      id: Joi.string(),
      token: Joi.string()
        .lowercase()
        .pattern(/^0x[a-fA-F0-9]{40}:[0-9]+$/)
        .description(
          "Filter to a particular token, e.g. `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:123`"
        ),
      tokenSetId: Joi.string().description(
        "Filter to a particular set. Example: `token:CONTRACT:TOKEN_ID` representing a single token within contract, `contract:CONTRACT` representing a whole contract, `range:CONTRACT:START_TOKEN_ID:END_TOKEN_ID` representing a continuous token id range within a contract and `list:CONTRACT:TOKEN_IDS_HASH` representing a list of token ids within a contract."
      ),
      offset: Joi.number().integer().min(0).max(10000).default(0),
      limit: Joi.number().integer().min(1).max(50).default(20),
    })
      .or("id", "token", "tokenSetId")
      .oxor("id", "token", "tokenSetId"),
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
          tokenSetSchemaHash: Joi.string().required(),
          maker: Joi.string()
            .lowercase()
            .pattern(/^0x[a-fA-F0-9]{40}$/)
            .required(),
          taker: Joi.string()
            .lowercase()
            .pattern(/^0x[a-fA-F0-9]{40}$/)
            .required(),
          price: Joi.number().unsafe().required(),
          value: Joi.number().unsafe().required(),
          validFrom: Joi.number().required(),
          validUntil: Joi.number().required(),
          source: Joi.string().allow(null),
          feeBps: Joi.number().allow(null),
          feeBreakdown: Joi.array()
            .items(
              Joi.object({
                kind: Joi.string(),
                recipient: Joi.string()
                  .lowercase()
                  .pattern(/^0x[a-fA-F0-9]{40}$/)
                  .allow(null),
                bps: Joi.number(),
              })
            )
            .allow(null),
          expiration: Joi.number().required(),
          createdAt: Joi.string().required(),
          updatedAt: Joi.string().required(),
          rawData: Joi.object().allow(null),
        })
      ),
    }).label(`getOrders${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-orders-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      let baseQuery = `
        SELECT DISTINCT ON ("o"."id")
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
          "o"."source_id_int",
          "o"."fee_bps",
          "o"."fee_breakdown",
          COALESCE(
            NULLIF(DATE_PART('epoch', "o"."expiration"), 'Infinity'),
            0
          ) AS "expiration",
          "o"."created_at",
          "o"."updated_at",
          "o"."raw_data"
        FROM "orders" "o"
      `;

      if (query.token) {
        baseQuery += `
          JOIN "token_sets_tokens" "tst"
            ON "o"."token_set_id" = "tst"."token_set_id"
        `;
      }

      // Filters
      const conditions: string[] = [
        `"o"."fillability_status" = 'fillable'`,
        `"o"."approval_status" = 'approved'`,
      ];
      if (query.id) {
        conditions.push(`"o"."id" = $/id/`);
      }
      if (query.token) {
        const [contract, tokenId] = query.token.split(":");

        (query as any).contract = toBuffer(contract);
        (query as any).tokenId = tokenId;
        conditions.push(`"tst"."contract" = $/contract/`);
        conditions.push(`"tst"."token_id" = $/tokenId/`);
      }
      if (query.tokenSetId) {
        conditions.push(`"o"."token_set_id" = $/tokenSetId/`);
      }
      if (conditions.length) {
        baseQuery += " WHERE " + conditions.map((c) => `(${c})`).join(" AND ");
      }

      // Sorting
      baseQuery += ` ORDER BY "o"."id"`;

      // Pagination
      baseQuery += ` OFFSET $/offset/`;
      baseQuery += ` LIMIT $/limit/`;

      const sources = await Sources.getInstance();
      const result = await redb.manyOrNone(baseQuery, query).then((result) =>
        result.map((r) => {
          return {
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
                : formatEth(r.value) - (formatEth(r.value) * Number(r.fee_bps)) / 10000,
            validFrom: Number(r.valid_from),
            validUntil: Number(r.valid_until),
            source: sources.get(r.source_id_int)?.name,
            feeBps: Number(r.fee_bps),
            feeBreakdown: r.fee_breakdown,
            expiration: Number(r.expiration),
            createdAt: new Date(r.created_at).toISOString(),
            updatedAt: new Date(r.updated_at).toISOString(),
            rawData: r.raw_data,
          };
        })
      );

      return { orders: result };
    } catch (error) {
      logger.error(`get-orders-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
