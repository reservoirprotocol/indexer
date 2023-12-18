/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import _ from "lodash";

import { edb, redb } from "@/common/db";
import { logger } from "@/common/logger";
import { JoiOrder, getJoiOrderObject } from "@/common/joi";
import {
  buildContinuation,
  getNetAmount,
  regex,
  splitContinuation,
  toBuffer,
} from "@/common/utils";
import { CollectionSets } from "@/models/collection-sets";
import { ContractSets } from "@/models/contract-sets";
import { Sources } from "@/models/sources";
import { TokenSets } from "@/models/token-sets";
import { Orders } from "@/utils/orders";
import { config } from "@/config/index";

const version = "v4";

export const getOrdersAsksV4Options: RouteOptions = {
  description: "Asks (listings)",
  notes:
    "Get a list of asks (listings), filtered by token, collection or maker. This API is designed for efficiently ingesting large volumes of orders, for external processing.\n\n Please mark `excludeEOA` as `true` to exclude Blur orders.",
  tags: ["api", "x-deprecated"],
  plugins: {
    "hapi-swagger": {
      order: 5,
    },
  },
  validate: {
    query: Joi.object({
      ids: Joi.alternatives(Joi.array().items(Joi.string()), Joi.string()).description(
        "Order id(s) to search for."
      ),
      token: Joi.string()
        .lowercase()
        .pattern(regex.token)
        .description(
          "Filter to a particular token. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:123`"
        ),
      tokenSetId: Joi.string().description(
        "Filter to a particular set, e.g. `contract:0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
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
        .description(
          "Filter to a particular collection set. Example: `8daa732ebe5db23f267e58d52f1c9b1879279bcdf4f78b8fb563390e6946ea65`"
        ),
      contractsSetId: Joi.string().lowercase().description("Filter to a particular contracts set."),
      contracts: Joi.alternatives()
        .try(
          Joi.array().max(80).items(Joi.string().lowercase().pattern(regex.address)),
          Joi.string().lowercase().pattern(regex.address)
        )
        .description(
          "Filter to an array of contracts. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
      status: Joi.string()
        .when("ids", {
          is: Joi.exist(),
          then: Joi.valid("active", "inactive", "expired", "cancelled", "filled", "any").default(
            "any"
          ),
          otherwise: Joi.valid("active"),
        })
        .when("maker", {
          is: Joi.exist(),
          then: Joi.valid("active", "inactive", "expired", "cancelled", "filled"),
          otherwise: Joi.valid("active"),
        })
        .when("contracts", {
          is: Joi.exist(),
          then: Joi.valid("active", "any"),
          otherwise: Joi.valid("active"),
        })
        .when("sortBy", {
          is: Joi.valid("updatedAt"),
          then: Joi.valid("any", "active").default("any"),
          otherwise: Joi.valid("active"),
        })
        .description(
          "activeª^º = currently valid\ninactiveª^ = temporarily invalid\nexpiredª^, canceledª^, filledª^ = permanently invalid\nanyªº = any status\nª when an `id` is passed\n^ when a `maker` is passed\nº when a `contract` is passed"
        ),
      source: Joi.string()
        .pattern(regex.domain)
        .description(
          "Filter to a source by domain. Only active listed will be returned. Example: `opensea.io`"
        ),
      native: Joi.boolean().description("If true, results will filter only Reservoir orders."),
      includePrivate: Joi.boolean()
        .default(false)
        .description("If true, private orders are included in the response."),
      includeCriteriaMetadata: Joi.boolean()
        .default(false)
        .description("If true, criteria metadata is included in the response."),
      includeRawData: Joi.boolean()
        .default(false)
        .description("If true, raw data is included in the response."),
      includeDynamicPricing: Joi.boolean()
        .default(false)
        .description("If true, dynamic pricing data will be returned in the response."),
      excludeEOA: Joi.boolean()
        .default(false)
        .description(
          "Exclude orders that can only be filled by EOAs, to support filling with smart contracts."
        ),
      startTimestamp: Joi.number().description(
        "Get events after a particular unix timestamp (inclusive)"
      ),
      endTimestamp: Joi.number().description(
        "Get events before a particular unix timestamp (inclusive)"
      ),
      normalizeRoyalties: Joi.boolean()
        .default(false)
        .description("If true, prices will include missing royalties to be added on-top."),
      sortBy: Joi.string()
        .valid("createdAt", "price", "updatedAt")
        .default("createdAt")
        .description(
          "Order the items are returned in the response, Sorting by price allowed only when filtering by token"
        ),
      sortDirection: Joi.string()
        .lowercase()
        .when("sortBy", {
          is: Joi.valid("updatedAt"),
          then: Joi.valid("asc", "desc").default("desc"),
          otherwise: Joi.when("sortBy", {
            is: Joi.valid("price"),
            then: Joi.valid("asc", "desc").default("asc"),
            otherwise: Joi.valid("desc").default("desc"),
          }),
        }),
      continuation: Joi.string()
        .pattern(regex.base64)
        .description("Use continuation token to request next offset of items."),
      limit: Joi.number()
        .integer()
        .min(1)
        .max(1000)
        .default(50)
        .description("Amount of items returned in response."),
      displayCurrency: Joi.string()
        .lowercase()
        .pattern(regex.address)
        .description("Return result in given currency"),
    })
      .oxor("token", "tokenSetId")
      .oxor("contracts", "contractsSetId")
      .with("community", "maker")
      .with("collectionsSetId", "maker"),
  },
  response: {
    schema: Joi.object({
      orders: Joi.array()
        .items(JoiOrder)
        .description("`taker` will have wallet address if private listing."),
      continuation: Joi.string().pattern(regex.base64).allow(null),
    }).label(`getOrdersAsks${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-orders-asks-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    // Log timing to debug when limit is 1000 and sortBy is updatedAt
    const debugLog = query.limit === 1000 && query.sortBy === "updatedAt";
    const debugStart = Date.now();
    const debugTimings = [];

    try {
      const criteriaBuildQuery = Orders.buildCriteriaQuery(
        "orders",
        "token_set_id",
        query.includeCriteriaMetadata
      );

      let baseQuery = `
        SELECT
          contracts.kind AS "contract_kind",
          orders.id,
          orders.kind,
          orders.side,
          orders.token_set_id,
          orders.token_set_schema_hash,
          orders.contract,
          orders.maker,
          orders.taker,
          orders.currency,
          orders.price,
          orders.value,
          orders.currency_price,
          orders.currency_value,
          orders.normalized_value,
          orders.currency_normalized_value,
          orders.missing_royalties,
          dynamic,
          DATE_PART('epoch', LOWER(orders.valid_between)) AS valid_from,
          COALESCE(
            NULLIF(DATE_PART('epoch', UPPER(orders.valid_between)), 'Infinity'),
            0
          ) AS valid_until,
          orders.source_id_int,
          orders.quantity_filled,
          orders.quantity_remaining,
          coalesce(orders.fee_bps, 0) AS fee_bps,
          orders.fee_breakdown,
          COALESCE(
            NULLIF(DATE_PART('epoch', orders.expiration), 'Infinity'),
            0
          ) AS expiration,
          orders.is_reservoir,
          extract(epoch from orders.created_at) AS created_at,
          (
            CASE
              WHEN orders.fillability_status = 'filled' THEN 'filled'
              WHEN orders.fillability_status = 'cancelled' THEN 'cancelled'
              WHEN orders.fillability_status = 'expired' THEN 'expired'
              WHEN orders.fillability_status = 'no-balance' THEN 'inactive'
              WHEN orders.approval_status = 'no-approval' THEN 'inactive'
              WHEN orders.approval_status = 'disabled' THEN 'inactive'
              ELSE 'active'
            END
          ) AS status,
          extract(epoch from orders.updated_at) AS updated_at,
          orders.originated_at,
          (${criteriaBuildQuery}) AS criteria
          ${query.includeRawData || query.includeDynamicPricing ? ", orders.raw_data" : ""}
        FROM orders
        JOIN LATERAL (
          SELECT kind
          FROM contracts
          WHERE contracts.address = orders.contract
        ) contracts ON TRUE
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
          ? query.sortBy === "updatedAt"
            ? [
                `orders.updated_at >= to_timestamp($/startTimestamp/)`,
                `orders.updated_at <= to_timestamp($/endTimestamp/)`,
                `orders.side = 'sell'`,
              ]
            : [
                `orders.created_at >= to_timestamp($/startTimestamp/)`,
                `orders.created_at <= to_timestamp($/endTimestamp/)`,
                `orders.side = 'sell'`,
              ]
          : [`orders.side = 'sell'`];

      let communityFilter = "";
      let collectionSetFilter = "";
      let orderStatusFilter = "";

      if (query.ids) {
        if (Array.isArray(query.ids)) {
          conditions.push(`orders.id IN ($/ids:csv/)`);
        } else {
          conditions.push(`orders.id = $/ids/`);
        }
      }

      /*
      Since status = any is allowed when sorting by updatedAt, this if statement blocks 
      requests which include expensive query params (token, tokenSetId, community, etc.) 
      unless "maker" or "ids" are passed (as any status is already permitted when using these params)
      */
      if (
        query.sortBy === "updatedAt" &&
        !query.maker &&
        !query.ids &&
        query.status !== "active" &&
        (query.token ||
          query.tokenSetId ||
          query.community ||
          query.collectionsSetId ||
          query.native ||
          query.source)
      ) {
        throw Boom.badRequest(
          `You must provide one of the following: [ids, maker, contracts] in order to filter querys with sortBy = updatedAt and status != 'active.`
        );
      }

      // TODO Remove this restriction once an index is created for updatedAt and contracts
      if (query.sortBy === "updatedAt" && query.contracts && query.status === "any") {
        throw Boom.badRequest(
          `Cannot filter by contracts while sortBy = "updatedAt" and status = "any"`
        );
      }

      switch (query.status) {
        case "active": {
          orderStatusFilter = `orders.fillability_status = 'fillable' AND orders.approval_status = 'approved'`;
          break;
        }
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
        case "any": {
          orderStatusFilter = "";

          // Fix for the issue with negative prices for dutch auction orders
          // (eg. due to orders not properly expired on time)
          conditions.push(`coalesce(orders.price, 0) >= 0`);
          break;
        }
        default: {
          orderStatusFilter = `orders.fillability_status = 'fillable' AND orders.approval_status = 'approved'`;
        }
      }

      if (query.token) {
        (query as any).tokenSetId = `token:${query.token}`;
        conditions.push(`orders.token_set_id = $/tokenSetId/`);
      }

      if (query.tokenSetId) {
        baseQuery += `
            JOIN token_sets_tokens tst1
              ON tst1.token_set_id = orders.token_set_id
            JOIN token_sets_tokens tst2
              ON tst2.contract = tst1.contract
              AND tst2.token_id = tst1.token_id
        `;

        conditions.push(`tst2.token_set_id = $/tokenSetId/`);
        const contractFilter = TokenSets.getContractFromTokenSetId(query.tokenSetId);
        if (contractFilter) {
          query.contractFilter = toBuffer(contractFilter);
          conditions.push(`orders.contract = $/contractFilter/`);
        }
      }

      if (query.contractsSetId) {
        query.contracts = await ContractSets.getContracts(query.contractsSetId);
        if (_.isEmpty(query.contracts)) {
          throw Boom.badRequest(`No contracts for contracts set ${query.contractsSetId}`);
        }
      }

      if (query.contracts) {
        if (!_.isArray(query.contracts)) {
          query.contracts = [query.contracts];
        }

        (query as any).contractsFilter = query.contracts.map(toBuffer);
        conditions.push(`orders.contract IN ($/contractsFilter:list/)`);
      }

      if (query.maker) {
        (query as any).maker = toBuffer(query.maker);
        conditions.push(`orders.maker = $/maker/`);

        // Community filter is valid only when maker filter is passed
        if (query.community) {
          communityFilter =
            "JOIN (SELECT DISTINCT contract FROM collections WHERE community = $/community/) c ON orders.contract = c.contract";
        }

        // collectionsIds filter is valid only when maker filter is passed
        if (query.collectionsSetId) {
          query.collectionsIds = await CollectionSets.getCollectionsIds(query.collectionsSetId);
          if (_.isEmpty(query.collectionsIds)) {
            throw Boom.badRequest(`No collections for collection set ${query.collectionsSetId}`);
          }

          collectionSetFilter = `
            JOIN LATERAL (
              SELECT
                contract,
                token_id
              FROM
                token_sets_tokens
              WHERE
                token_sets_tokens.token_set_id = orders.token_set_id
              LIMIT 1) tst ON TRUE
            JOIN tokens ON tokens.contract = tst.contract
              AND tokens.token_id = tst.token_id
          `;

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

      if (!query.includePrivate) {
        conditions.push(
          `orders.taker = '\\x0000000000000000000000000000000000000000' OR orders.taker IS NULL`
        );
      }

      if (query.excludeEOA) {
        conditions.push(`orders.kind != 'blur'`);
      }

      if (orderStatusFilter) {
        conditions.push(orderStatusFilter);
      }

      if (query.continuation) {
        const [priceOrCreatedAtOrUpdatedAt, id] = splitContinuation(
          query.continuation,
          /^\d+(.\d+)?_0x[a-f0-9]{64}$/
        );
        (query as any).priceOrCreatedAtOrUpdatedAt = priceOrCreatedAtOrUpdatedAt;
        (query as any).id = id;

        if (query.sortBy === "price") {
          if (query.normalizeRoyalties) {
            conditions.push(
              `(orders.normalized_value, orders.id) > ($/priceOrCreatedAtOrUpdatedAt/, $/id/)`
            );
          } else {
            conditions.push(`(orders.price, orders.id) > ($/priceOrCreatedAtOrUpdatedAt/, $/id/)`);
          }
        } else if (query.sortBy === "updatedAt") {
          if (query.sortDirection === "asc") {
            conditions.push(
              `(orders.updated_at, orders.id) > (to_timestamp($/priceOrCreatedAtOrUpdatedAt/), $/id/)`
            );
          } else {
            conditions.push(
              `(orders.updated_at, orders.id) < (to_timestamp($/priceOrCreatedAtOrUpdatedAt/), $/id/)`
            );
          }
        } else {
          conditions.push(
            `(orders.created_at, orders.id) < (to_timestamp($/priceOrCreatedAtOrUpdatedAt/), $/id/)`
          );
        }
      }

      baseQuery += communityFilter;
      baseQuery += collectionSetFilter;

      if (conditions.length) {
        baseQuery += " WHERE " + conditions.map((c) => `(${c})`).join(" AND ");
      }

      // Sorting
      if (query.sortBy === "price") {
        if (query.normalizeRoyalties) {
          baseQuery += ` ORDER BY orders.normalized_value, orders.id`;
        } else {
          baseQuery += ` ORDER BY orders.price, orders.id`;
        }
      } else if (query.sortBy === "updatedAt") {
        if (query.sortDirection === "asc") {
          baseQuery += ` ORDER BY orders.updated_at ASC, orders.id ASC`;
        } else {
          baseQuery += ` ORDER BY orders.updated_at DESC, orders.id DESC`;
        }
      } else {
        baseQuery += ` ORDER BY orders.created_at DESC, orders.id DESC`;
      }

      // Pagination
      baseQuery += ` LIMIT $/limit/`;

      if (debugLog) {
        debugTimings.push({ beforeQuery: Date.now() - debugStart });
      }

      const rawResult =
        config.chainId === 137
          ? await edb.manyOrNone(baseQuery, query)
          : await redb.manyOrNone(baseQuery, query);

      if (debugLog) {
        debugTimings.push({ afterQuery: Date.now() - debugStart });
      }

      let continuation = null;
      if (rawResult.length === query.limit) {
        if (query.sortBy === "price") {
          if (query.normalizeRoyalties) {
            continuation = buildContinuation(
              rawResult[rawResult.length - 1].normalized_value ??
                rawResult[rawResult.length - 1].price + "_" + rawResult[rawResult.length - 1].id
            );
          } else {
            continuation = buildContinuation(
              rawResult[rawResult.length - 1].price + "_" + rawResult[rawResult.length - 1].id
            );
          }
        } else if (query.sortBy === "updatedAt") {
          continuation = buildContinuation(
            rawResult[rawResult.length - 1].updated_at + "_" + rawResult[rawResult.length - 1].id
          );
        } else {
          continuation = buildContinuation(
            rawResult[rawResult.length - 1].created_at + "_" + rawResult[rawResult.length - 1].id
          );
        }
      }

      const result = rawResult.map(async (r) => {
        return await getJoiOrderObject({
          id: r.id,
          kind: r.kind,
          side: r.side,
          status: r.status,
          tokenSetId: r.token_set_id,
          tokenSetSchemaHash: r.token_set_schema_hash,
          contract: r.contract,
          contractKind: r.contract_kind,
          maker: r.maker,
          taker: r.taker,
          prices: {
            gross: {
              amount: query.normalizeRoyalties
                ? r.currency_normalized_value ?? r.price
                : r.currency_price ?? r.price,
              nativeAmount: query.normalizeRoyalties ? r.normalized_value ?? r.price : r.price,
            },
            net: {
              amount: getNetAmount(r.currency_price ?? r.price, _.min([r.fee_bps, 10000])),
              nativeAmount: getNetAmount(r.price, _.min([r.fee_bps, 10000])),
            },
            currency: r.currency,
          },
          validFrom: r.valid_from,
          validUntil: r.valid_until,
          quantityFilled: r.quantity_filled,
          quantityRemaining: r.quantity_remaining,
          criteria: r.criteria,
          sourceIdInt: r.source_id_int,
          feeBps: r.fee_bps,
          feeBreakdown: r.fee_bps === 0 ? [] : r.fee_breakdown,
          expiration: r.expiration,
          isReservoir: r.is_reservoir,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
          originatedAt: r.originated_at,
          includeRawData: query.includeRawData,
          rawData: r.raw_data,
          normalizeRoyalties: query.normalizeRoyalties,
          missingRoyalties: r.missing_royalties,
          includeDynamicPricing: query.includeDynamicPricing,
          dynamic: r.dynamic,
          displayCurrency: query.displayCurrency,
        });
      });

      if (debugLog) {
        debugTimings.push({ sendingResponse: Date.now() - debugStart });
        logger.info(
          `get-orders-asks-${version}-timing`,
          JSON.stringify({ debugStart, debugTimings })
        );
      }

      return {
        orders: await Promise.all(result),
        continuation,
      };
    } catch (error) {
      logger.error(`get-orders-asks-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
