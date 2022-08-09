/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { formatEth, fromBuffer } from "@/common/utils";
import { Sources } from "@/models/sources";
import { SourcesEntity } from "@/models/sources/sources-entity";
import _ from "lodash";

const version = "v1";

export const getReceivedBidsV1Options: RouteOptions = {
  description: "Received Bids (offers)",
  notes:
    "Get a list of received bids (offers), filtered by token, collection or maker. This API is designed for efficiently ingesting large volumes of orders, for external processing",
  tags: ["api", "Orders"],
  plugins: {
    "hapi-swagger": {
      order: 5,
    },
  },
  validate: {
    query: Joi.object({
      limit: Joi.number().integer().min(1).max(1000).default(20),
      continuation: Joi.number().default(null),
    }),
  },
  response: {
    schema: Joi.object({
      bids: Joi.array().items(
        Joi.object({
          id: Joi.number(),
          address: Joi.string(),
          contract: Joi.string(),
          maker: Joi.string(),
          price: Joi.number().unsafe(),
          value: Joi.number().unsafe(),
          validFrom: Joi.number(),
          validUntil: Joi.number(),
          metadata: Joi.alternatives(
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
          source: Joi.object().allow(null),
          createdAt: Joi.string(),
        })
      ),
      continuation: Joi.number()
        .allow(null)
        .description("Use continuation token to request next offset of items."),
    }).label(`getReceivedBids${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-received-bids-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    let continuationFilter = "";

    if (!_.isNull(query.continuation)) {
      continuationFilter = `WHERE user_received_bids.id < $/continuation/`;
    }

    try {
      const baseQuery = `       
        SELECT
            user_received_bids.id,
            user_received_bids.token_set_id,
            user_received_bids.order_source_id_int,
            user_received_bids.address,
            user_received_bids.contract,
            user_received_bids.maker,
            user_received_bids.price,
            user_received_bids.value,
            user_received_bids.metadata,
            DATE_PART('epoch', LOWER(user_received_bids.valid_between)) AS valid_from,
            COALESCE(
              NULLIF(DATE_PART('epoch', UPPER(user_received_bids.valid_between)), 'Infinity'),
              0
            ) AS valid_until,
            extract(epoch from user_received_bids.order_created_at) AS created_at
        FROM user_received_bids
        ${continuationFilter}
        ORDER BY id DESC
        LIMIT $/limit/
      `;

      const sources = await Sources.getInstance();

      const result = await redb.manyOrNone(baseQuery, query).then((result) =>
        result.map((r) => {
          let source: SourcesEntity | undefined;

          if (r.order_source_id_int !== null) {
            if (r.token_set_id?.startsWith("token")) {
              const [, contract, tokenId] = r.token_set_id.split(":");
              source = sources.get(r.order_source_id_int, contract, tokenId);
            } else {
              source = sources.get(r.order_source_id_int);
            }
          }

          return {
            id: Number(r.id),
            address: fromBuffer(r.address),
            contract: fromBuffer(r.contract),
            maker: fromBuffer(r.maker),
            price: formatEth(r.price),
            value: formatEth(r.value),
            validFrom: Number(r.valid_from),
            validUntil: Number(r.valid_until),
            metadata: r.metadata,
            source: {
              id: source?.address,
              name: source?.name,
              icon: source?.metadata.icon,
              url: source?.metadata.url,
            },
            createdAt: new Date(r.created_at * 1000).toISOString(),
          };
        })
      );

      // Set the continuation node
      let continuation = null;
      if (result.length === query.limit) {
        const lastBid = _.last(result);

        if (lastBid) {
          continuation = Number(lastBid.id);
        }
      }

      return { bids: result, continuation };
    } catch (error) {
      logger.error(`get-received-bids-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
