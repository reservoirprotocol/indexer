/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import * as Boom from "@hapi/boom";
import Joi from "joi";
import _ from "lodash";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { JoiPrice, getJoiPriceObject, JoiOrderCriteria } from "@/common/joi";
import { buildContinuation, fromBuffer, regex, splitContinuation, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { Sources } from "@/models/sources";
import { SourcesEntity } from "@/models/sources/sources-entity";
import { Orders } from "@/utils/orders";
import { Attributes } from "@/models/attributes";
import { CollectionSets } from "@/models/collection-sets";

const version = "v5";

export const getOrdersBidsV5Options: RouteOptions = {
  description: "Bids (offers)",
  notes:
    "Get a list of bids (offers), filtered by token, collection or maker. This API is designed for efficiently ingesting large volumes of orders, for external processing",
  tags: ["api", "Orders"],
  plugins: {
    "hapi-swagger": {
      order: 5,
    },
  },
  validate: {
    query: Joi.object({
      ids: Joi.alternatives(Joi.array().items(Joi.string()), Joi.string()).description(
        "Order id(s) to search for (only fillable and approved orders will be returned)"
      ),
      token: Joi.string()
        .lowercase()
        .pattern(regex.token)
        .description(
          "Filter to a particular token. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:123`"
        ),
      tokenSetId: Joi.string()
        .lowercase()
        .description(
          "Filter to a particular set. Example: `contract:0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63` or `token:0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:1`"
        ),
      maker: Joi.string()
        .lowercase()
        .pattern(regex.address)
        .description(
          "Filter to a particular user. Example: `0xF296178d553C8Ec21A2fBD2c5dDa8CA9ac905A00`"
        ),
      community: Joi.string()
        .lowercase()
        .description("Filter to a particular community. Example: `artblocks`"),
      collectionsSetId: Joi.string()
        .lowercase()
        .description("Filter to a particular collection set."),
      collection: Joi.string()
        .lowercase()
        .description(
          "Filter to a particular collection bids with collection-id. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
      attribute: Joi.object()
        .unknown()
        .description(
          "Filter to a particular attribute within a collection. Example: `attribute[Mouth]=Bored` (Collection must be passed as well when filtering by attribute)"
        ),
      contracts: Joi.alternatives().try(
        Joi.array()
          .max(50)
          .items(Joi.string().lowercase().pattern(regex.address))
          .description(
            "Filter to an array of contracts. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
          ),
        Joi.string()
          .lowercase()
          .pattern(regex.address)
          .description(
            "Filter to an array of contracts. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
          )
      ),
      status: Joi.string()
        .when("maker", {
          is: Joi.exist(),
          then: Joi.valid("active", "inactive", "expired", "cancelled", "filled"),
          otherwise: Joi.valid("active"),
        })
        .description(
          "active = currently valid\ninactive = temporarily invalid\nexpired, cancelled, filled = permanently invalid\n\nAvailable when filtering by maker, otherwise only valid orders will be returned"
        ),
      source: Joi.string()
        .pattern(regex.domain)
        .description("Filter to a source by domain. Example: `opensea.io`"),
      native: Joi.boolean().description("If true, results will filter only Reservoir orders."),
      includeCriteriaMetadata: Joi.boolean().description(
        "If true, criteria metadata is included in the response."
      ),
      includeRawData: Joi.boolean().description("If true, raw data is included in the response."),
      startTimestamp: Joi.number().description(
        "Get events after a particular unix timestamp (inclusive)"
      ),
      endTimestamp: Joi.number().description(
        "Get events before a particular unix timestamp (inclusive)"
      ),
      normalizeRoyalties: Joi.boolean().description(
        "If true, prices will include missing royalties to be added on-top."
      ),
      sortBy: Joi.string()
        .when("token", {
          is: Joi.exist(),
          then: Joi.valid("price", "createdAt"),
          otherwise: Joi.valid("createdAt"),
        })
        .valid("createdAt", "price")
        .description(
          "Order the items are returned in the response, Sorting by price allowed only when filtering by token"
        ),
      continuation: Joi.string()
        .pattern(regex.base64)
        .description("Use continuation token to request next offset of items."),
      limit: Joi.number()
        .integer()
        .min(1)
        .max(1000)
        .description("Amount of items returned in response."),
    })
      .oxor("token", "tokenSetId", "contracts", "ids", "collection", "collectionsSetId")
      .with("community", "maker")
      .with("collectionsSetId", "maker")
      .with("attribute", "collection"),
  },
  response: {
    schema: Joi.object({
      orders: Joi.array().items(
        Joi.object({
          id: Joi.string().required(),
          kind: Joi.string().required(),
          side: Joi.string().valid("buy", "sell").required(),
          status: Joi.string(),
          tokenSetId: Joi.string().required(),
          tokenSetSchemaHash: Joi.string().lowercase().pattern(regex.bytes32).required(),
          contract: Joi.string().lowercase().pattern(regex.address),
          maker: Joi.string().lowercase().pattern(regex.address).required(),
          taker: Joi.string().lowercase().pattern(regex.address).required(),
          price: JoiPrice,
          validFrom: Joi.number().required(),
          validUntil: Joi.number().required(),
          quantityFilled: Joi.number().unsafe(),
          quantityRemaining: Joi.number().unsafe(),
          criteria: JoiOrderCriteria.allow(null),
          source: Joi.object().allow(null),
          feeBps: Joi.number().allow(null),
          feeBreakdown: Joi.array()
            .items(
              Joi.object({
                kind: Joi.string(),
                recipient: Joi.string().allow("", null),
                bps: Joi.number(),
              })
            )
            .allow(null),
          expiration: Joi.number().required(),
          isReservoir: Joi.boolean().allow(null),
          createdAt: Joi.string().required(),
          updatedAt: Joi.string().required(),
          rawData: Joi.object().optional().allow(null),
        })
      ),
      continuation: Joi.string().pattern(regex.base64).allow(null),
    }).label(`getOrdersBids${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-orders-bids-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    if (!query.limit) {
      query.limit = 50;
    }

    if (!query.sortBy) {
      query.sortBy = "createdAt";
    }

    try {
      const criteriaBuildQuery = Orders.buildCriteriaQuery(
        "orders",
        "token_set_id",
        query.includeCriteriaMetadata
      );

      let baseQuery = `
        SELECT
          orders.id,
          orders.kind,
          orders.side,
          (
            CASE
              WHEN orders.fillability_status = 'filled' THEN 'filled'
              WHEN orders.fillability_status = 'cancelled' THEN 'cancelled'
              WHEN orders.fillability_status = 'expired' THEN 'expired'
              WHEN orders.fillability_status = 'no-balance' THEN 'inactive'
              WHEN orders.approval_status = 'no-approval' THEN 'inactive'
              ELSE 'active'
            END
          ) AS status,
          orders.token_set_id,
          orders.token_set_schema_hash,
          orders.contract,
          orders.maker,
          orders.taker,
          orders.price,
          orders.value,
          orders.currency,
          orders.currency_price,
          orders.currency_value,
          orders.normalized_value,
          orders.currency_normalized_value,
          orders.missing_royalties,
          DATE_PART('epoch', LOWER(orders.valid_between)) AS valid_from,
          COALESCE(
            NULLIF(DATE_PART('epoch', UPPER(orders.valid_between)), 'Infinity'),
            0
          ) AS valid_until,
          orders.source_id_int,
          orders.quantity_filled,
          orders.quantity_remaining,
          orders.fee_bps,
          orders.fee_breakdown,
          COALESCE(
            NULLIF(DATE_PART('epoch', orders.expiration), 'Infinity'),
            0
          ) AS expiration,
          orders.is_reservoir,
          extract(epoch from orders.created_at) AS created_at,
          orders.updated_at,
          (${criteriaBuildQuery}) AS criteria
          ${query.includeRawData ? ", orders.raw_data" : ""}
        FROM orders
      `;

      // We default in the code so that these values don't appear in the docs
      if (query.startTimestamp || query.endTimestamp) {
        if (!query.startTimestamp) {
          query.startTimestamp = 0;
        }
        if (!query.endTimestamp) {
          query.endTimestamp = 9999999999;
        }
      }

      // Filters
      const conditions: string[] =
        query.startTimestamp || query.endTimestamp
          ? [
              `orders.created_at >= to_timestamp($/startTimestamp/)`,
              `orders.created_at <= to_timestamp($/endTimestamp/)`,
              `orders.side = 'buy'`,
            ]
          : [`orders.side = 'buy'`];

      let communityFilter = "";
      let collectionSetFilter = "";
      let orderStatusFilter;

      if (query.ids) {
        if (Array.isArray(query.ids)) {
          conditions.push(`orders.id IN ($/ids:csv/)`);
        } else {
          conditions.push(`orders.id = $/ids/`);
        }
      } else {
        orderStatusFilter = `orders.fillability_status = 'fillable' AND orders.approval_status = 'approved'`;
      }

      if (query.tokenSetId) {
        conditions.push(`orders.token_set_id = $/tokenSetId/`);
      }

      if (query.token) {
        baseQuery += ` JOIN token_sets_tokens ON token_sets_tokens.token_set_id = orders.token_set_id`;

        const [contract, tokenId] = query.token.split(":");

        (query as any).tokenContract = toBuffer(contract);
        (query as any).tokenId = tokenId;

        conditions.push(`token_sets_tokens.contract = $/tokenContract/`);
        conditions.push(`token_sets_tokens.token_id = $/tokenId/`);
      }

      if (query.collection && !query.attribute) {
        baseQuery += ` JOIN token_sets ON token_sets.id = orders.token_set_id`;
        conditions.push(`token_sets.attribute_id IS NULL`);
        conditions.push(`token_sets.collection_id = $/collection/`);
      }

      if (query.attribute) {
        const attributeIds = [];
        for (const [key, value] of Object.entries(query.attribute)) {
          const attribute = await Attributes.getAttributeByCollectionKeyValue(
            query.collection,
            key,
            `${value}`
          );
          if (attribute) {
            attributeIds.push(attribute.id);
          }
        }

        if (_.isEmpty(attributeIds)) {
          return { orders: [] };
        }

        (query as any).attributeIds = attributeIds;

        baseQuery += ` JOIN token_sets ON token_sets.id = orders.token_set_id`;
        conditions.push(`token_sets.attribute_id IN ($/attributeIds:csv/)`);
      }

      if (query.contracts) {
        if (!_.isArray(query.contracts)) {
          query.contracts = [query.contracts];
        }

        for (const contract of query.contracts) {
          const contractsFilter = `'${_.replace(contract, "0x", "\\x")}'`;

          if (_.isUndefined((query as any).contractsFilter)) {
            (query as any).contractsFilter = [];
          }

          (query as any).contractsFilter.push(contractsFilter);
        }

        (query as any).contractsFilter = _.join((query as any).contractsFilter, ",");

        conditions.push(`orders.contract IN ($/contractsFilter:raw/)`);
      }

      if (query.maker) {
        switch (query.status) {
          case "inactive": {
            // Potentially-valid orders
            orderStatusFilter = `orders.fillability_status = 'no-balance' OR (orders.fillability_status = 'fillable' AND orders.approval_status != 'approved')`;
            break;
          }
          case "expired": {
            orderStatusFilter = `orders.fillability_status = 'expired'`;
            break;
          }
          case "filled": {
            orderStatusFilter = `orders.fillability_status = 'filled'`;
            break;
          }
          case "cancelled": {
            orderStatusFilter = `orders.fillability_status = 'cancelled'`;
            break;
          }
        }

        (query as any).maker = toBuffer(query.maker);
        conditions.push(`orders.maker = $/maker/`);

        // Community filter is valid only when maker filter is passed
        if (query.community) {
          communityFilter =
            "JOIN (SELECT DISTINCT contract FROM collections WHERE community = $/community/) c ON orders.contract = c.contract";
        }

        if (query.collectionsSetId) {
          query.collectionsIds = await CollectionSets.getCollectionsIds(query.collectionsSetId);
          if (_.isEmpty(query.collectionsIds)) {
            throw Boom.badRequest(`No collections for collection set ${query.collectionsSetId}`);
          }

          collectionSetFilter = `JOIN token_sets_tokens tst ON tst.token_set_id = orders.token_set_id
          JOIN tokens ON tokens.contract = tst.contract AND tokens.token_id = tst.token_id`;

          conditions.push(`tokens.collection_id IN ($/collectionsIds:csv/)`);
        }
      }

      if (query.source) {
        const sources = await Sources.getInstance();
        const source = sources.getByDomain(query.source);

        if (!source) {
          return { orders: [] };
        }

        (query as any).source = source.id;
        conditions.push(`orders.source_id_int = $/source/`);
      }

      if (query.native) {
        conditions.push(`orders.is_reservoir`);
      }

      if (orderStatusFilter) {
        conditions.push(orderStatusFilter);
      }

      if (query.continuation) {
        const [priceOrCreatedAt, id] = splitContinuation(
          query.continuation,
          /^\d+(.\d+)?_0x[a-f0-9]{64}$/
        );
        (query as any).priceOrCreatedAt = priceOrCreatedAt;
        (query as any).id = id;

        if (query.sortBy === "price") {
          conditions.push(`(orders.price, orders.id) < ($/priceOrCreatedAt/, $/id/)`);
        } else {
          conditions.push(
            `(orders.created_at, orders.id) < (to_timestamp($/priceOrCreatedAt/), $/id/)`
          );
        }
      }

      baseQuery += communityFilter;
      baseQuery += collectionSetFilter;

      if (conditions.length) {
        baseQuery += " WHERE " + conditions.map((c) => `(${c})`).join(" AND ");
      }

      baseQuery += ` GROUP BY orders.id`;

      // Sorting
      if (query.sortBy === "price") {
        baseQuery += ` ORDER BY orders.price DESC, orders.id DESC`;
      } else {
        baseQuery += ` ORDER BY orders.created_at DESC, orders.id DESC`;
      }

      // Pagination
      baseQuery += ` LIMIT $/limit/`;

      const rawResult = await redb.manyOrNone(baseQuery, query);

      let continuation = null;
      if (rawResult.length === query.limit) {
        if (query.sortBy === "price") {
          continuation = buildContinuation(
            rawResult[rawResult.length - 1].price + "_" + rawResult[rawResult.length - 1].id
          );
        } else {
          continuation = buildContinuation(
            rawResult[rawResult.length - 1].created_at + "_" + rawResult[rawResult.length - 1].id
          );
        }
      }

      const sources = await Sources.getInstance();
      const result = rawResult.map(async (r) => {
        const feeBreakdown = r.fee_breakdown;
        let feeBps = r.fee_bps;

        if (query.normalizeRoyalties && r.missing_royalties) {
          for (let i = 0; i < r.missing_royalties.length; i++) {
            const index: number = r.fee_breakdown.findIndex(
              (fee: { recipient: string }) => fee.recipient === r.missing_royalties[i].recipient
            );

            const missingFeeBps = Number(r.missing_royalties[i].bps);
            feeBps += missingFeeBps;

            if (index !== -1) {
              feeBreakdown[index].bps += missingFeeBps;
            } else {
              feeBreakdown.push({
                bps: missingFeeBps,
                kind: "royalty",
                recipient: r.missing_royalties[i].recipient,
              });
            }
          }
        }

        let source: SourcesEntity | undefined;

        if (r.token_set_id?.startsWith("token")) {
          const [, contract, tokenId] = r.token_set_id.split(":");
          source = sources.get(Number(r.source_id_int), contract, tokenId);
        } else if (query.token) {
          const [contract, tokenId] = query.token.split(":");
          source = sources.get(Number(r.source_id_int), contract, tokenId);
        } else {
          source = sources.get(Number(r.source_id_int));
        }

        return {
          id: r.id,
          kind: r.kind,
          side: r.side,
          status: r.status,
          tokenSetId: r.token_set_id,
          tokenSetSchemaHash: fromBuffer(r.token_set_schema_hash),
          contract: fromBuffer(r.contract),
          maker: fromBuffer(r.maker),
          taker: fromBuffer(r.taker),
          price: await getJoiPriceObject(
            {
              gross: {
                amount: r.currency_price ?? r.price,
                nativeAmount: r.price,
              },
              net: {
                amount: query.normalizeRoyalties
                  ? r.currency_normalized_value ?? r.value
                  : r.currency_value ?? r.value,
                nativeAmount: query.normalizeRoyalties ? r.normalized_value ?? r.value : r.value,
              },
            },
            r.currency
              ? fromBuffer(r.currency)
              : r.side === "sell"
              ? Sdk.Common.Addresses.Eth[config.chainId]
              : Sdk.Common.Addresses.Weth[config.chainId]
          ),
          validFrom: Number(r.valid_from),
          validUntil: Number(r.valid_until),
          quantityFilled: Number(r.quantity_filled),
          quantityRemaining: Number(r.quantity_remaining),
          criteria: r.criteria,
          source: {
            id: source?.address,
            name: source?.getTitle(),
            icon: source?.getIcon(),
            url: source?.metadata.url,
            domain: source?.domain,
          },
          feeBps: Number(feeBps.toString()),
          feeBreakdown: feeBreakdown,
          expiration: Number(r.expiration),
          isReservoir: r.is_reservoir,
          createdAt: new Date(r.created_at * 1000).toISOString(),
          updatedAt: new Date(r.updated_at).toISOString(),
          rawData: query.includeRawData ? r.raw_data : undefined,
        };
      });

      return {
        orders: await Promise.all(result),
        continuation,
      };
    } catch (error) {
      logger.error(`get-orders-bids-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
