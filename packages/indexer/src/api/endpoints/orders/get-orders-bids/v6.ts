/* eslint-disable @typescript-eslint/no-explicit-any */

import { AddressZero, HashZero } from "@ethersproject/constants";
import { parseEther } from "@ethersproject/units";
import { Request, RouteOptions } from "@hapi/hapi";
import * as Boom from "@hapi/boom";
import * as Sdk from "@reservoir0x/sdk";
import axios from "axios";
import Joi from "joi";
import _ from "lodash";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { JoiOrder, getJoiOrderObject } from "@/common/joi";
import {
  buildContinuation,
  fromBuffer,
  now,
  regex,
  splitContinuation,
  toBuffer,
} from "@/common/utils";
import { config } from "@/config/index";
import { Attributes } from "@/models/attributes";
import { CollectionSets } from "@/models/collection-sets";
import { Sources } from "@/models/sources";
import { ContractSets } from "@/models/contract-sets";
import { Orders } from "@/utils/orders";

const version = "v6";

export const getOrdersBidsV6Options: RouteOptions = {
  description: "Bids (offers)",
  notes:
    "Get a list of bids (offers), filtered by token, collection or maker. This API is designed for efficiently ingesting large volumes of orders, for external processing.\n\n There are a different kind of bids than can be returned:\n\n- To get all orders unfiltered, select `sortBy` to `updatedAt`. No need to pass any other param. This will return any orders for any collections, token, attribute, etc. \n\n- Inputting a 'contract' will return token and attribute bids.\n\n- Inputting a 'collection-id' will return collection wide bids.\n\n- Please mark `excludeEOA` as `true` to exclude Blur orders.",
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
      tokenSetId: Joi.string().description(
        "Filter to a particular set. Example: `token:CONTRACT:TOKEN_ID` representing a single token within contract, `contract:CONTRACT` representing a whole contract, `range:CONTRACT:START_TOKEN_ID:END_TOKEN_ID` representing a continuous token id range within a contract and `list:CONTRACT:TOKEN_IDS_HASH` representing a list of token ids within a contract."
      ),
      maker: Joi.string()
        .lowercase()
        .pattern(regex.address)
        .description(
          "Filter to a particular user. Must set `sources=blur.io` to reveal maker's blur bids. Example: `0xF296178d553C8Ec21A2fBD2c5dDa8CA9ac905A00`"
        ),
      community: Joi.string()
        .lowercase()
        .description("Filter to a particular community. Example: `artblocks`"),
      collectionsSetId: Joi.string()
        .lowercase()
        .description(
          "Filter to a particular collection set. Requires `maker` to be passed. Example: `8daa732ebe5db23f267e58d52f1c9b1879279bcdf4f78b8fb563390e6946ea65`"
        ),
      contractsSetId: Joi.string().lowercase().description("Filter to a particular contracts set."),
      collection: Joi.string()
        .lowercase()
        .description(
          "Filter to a particular collection bids with collection-id. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
      attribute: Joi.object()
        .unknown()
        .description(
          "Filter to a particular attribute. Note: Our docs do not support this parameter correctly. To test, you can use the following URL in your browser. Example: `https://api.reservoir.tools/orders/bids/v5?collection=0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63&attribute[Type]=Original` or `https://api.reservoir.tools/orders/bids/v5?collection=0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63&attribute[Type]=Original&attribute[Type]=Sibling`(Collection must be passed as well when filtering by attribute)"
        ),
      contracts: Joi.alternatives().try(
        Joi.array()
          .max(80)
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
        .when("ids", {
          is: Joi.exist(),
          then: Joi.valid("active", "inactive", "expired", "cancelled", "filled", "any").default(
            "any"
          ),
          otherwise: Joi.valid("active"),
        })
        .when("maker", {
          is: Joi.exist(),
          then: Joi.valid("active", "inactive"),
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
          "activeª^º = currently valid\ninactiveª^ = temporarily invalid\nexpiredª^, cancelledª^, filledª^ = permanently invalid\nanyªº = any status\nª when an `id` is passed\n^ when a `maker` is passed\nº when a `contract` is passed"
        ),
      sources: Joi.alternatives()
        .try(
          Joi.array().max(80).items(Joi.string().pattern(regex.domain)),
          Joi.string().pattern(regex.domain)
        )
        .description(
          "Filter to sources by domain. Only active listed will be returned. Must set `includeRawData=true` to reveal individual bids when `sources=blur.io`. Example: `opensea.io`"
        ),
      orderType: Joi.string()
        .when("maker", {
          is: Joi.exist(),
          then: Joi.allow(),
          otherwise: Joi.forbidden(),
        })
        .valid("token", "collection", "attribute", "custom")
        .description(
          "Filter to a particular order type. Must be one of `token`, `collection`, `attribute`, `custom`. Only valid when a maker is specified."
        ),
      native: Joi.boolean().description("If true, results will filter only Reservoir orders."),
      includePrivate: Joi.boolean()
        .when("ids", {
          is: Joi.exist(),
          then: Joi.valid(true, false).default(true),
          otherwise: Joi.valid(true, false).default(false),
        })
        .description("If true, private orders are included in the response."),
      includeCriteriaMetadata: Joi.boolean()
        .default(false)
        .description("If true, criteria metadata is included in the response."),
      includeRawData: Joi.boolean()
        .default(false)
        .description(
          "If true, raw data is included in the response. Set `sources=blur.io` and make this `true` to reveal individual blur bids."
        ),
      includeDepth: Joi.boolean()
        .default(false)
        .description("If true, the depth of each order is included in the response."),
      startTimestamp: Joi.number().description(
        "Get events after a particular unix timestamp (inclusive)"
      ),
      endTimestamp: Joi.number().description(
        "Get events before a particular unix timestamp (inclusive)"
      ),
      excludeEOA: Joi.boolean()
        .default(false)
        .description(
          "Exclude orders that can only be filled by EOAs, to support filling with smart contracts."
        ),
      excludeSources: Joi.alternatives()
        .try(
          Joi.array().max(80).items(Joi.string().pattern(regex.domain)),
          Joi.string().pattern(regex.domain)
        )
        .description("Exclude orders from a list of sources. Example: `opensea.io`"),
      normalizeRoyalties: Joi.boolean()
        .default(false)
        .description("If true, prices will include missing royalties to be added on-top."),
      sortBy: Joi.string()
        .valid("createdAt", "price", "updatedAt")
        .default("createdAt")
        .description(
          "Order the items are returned in the response. Sorting by `price` defaults sorting direction to descending. "
        ),
      sortDirection: Joi.string()
        .lowercase()
        .when("sortBy", {
          is: Joi.valid("updatedAt"),
          then: Joi.valid("asc", "desc").default("desc"),
          otherwise: Joi.valid("desc").default("desc"),
        }),
      continuation: Joi.string()
        .pattern(regex.base64)
        .description("Use continuation token to request next offset of items."),
      limit: Joi.number()
        .integer()
        .min(1)
        .max(1000)
        .default(50)
        .description("Amount of items returned in response. Max limit is 1000."),
      displayCurrency: Joi.string()
        .lowercase()
        .pattern(regex.address)
        .description("Return result in given currency"),
    })
      .oxor(
        "token",
        "tokenSetId",
        "contracts",
        "ids",
        "collection",
        "collectionsSetId",
        "contractsSetId"
      )
      .oxor("sources", "excludeSources")
      .with("community", "maker")
      .with("collectionsSetId", "maker")
      .with("attribute", "collection"),
  },
  response: {
    schema: Joi.object({
      orders: Joi.array().items(JoiOrder),
      continuation: Joi.string().pattern(regex.base64).allow(null),
    }).label(`getOrdersBids${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-orders-bids-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      // Since we treat Blur bids as a generic pool we cannot use the `orders`
      // table to fetch all the bids of a particular maker. However, filtering
      // by `maker` and `sources=blur.io` will result in making a call to Blur,
      // which will return the requested bids.
      if (query.sources === "blur.io" && query.maker) {
        if (config.chainId !== 1) {
          return {
            orders: [],
            continuation: null,
          };
        }

        if (query.status && query.status !== "active") {
          throw Boom.notImplemented("Only active orders are supported when requesting Blur orders");
        }

        const sources = await Sources.getInstance();
        const source = sources.getByDomain(query.sources);

        const result: {
          contract: string;
          price: string;
          quantity: number;
          contract_kind: string;
        }[] = await axios
          .get(`${config.orderFetcherBaseUrl}/api/blur-user-collection-bids?user=${query.maker}`)
          .then(async (response) => {
            if (_.isEmpty(response.data.bids)) {
              return [];
            }

            const contracts = _.map(response.data.bids, (bid) => bid.contract);
            const contractsQuery = `
              SELECT address, kind
              FROM contracts
              WHERE address IN ($/contracts:list/)
            `;

            const contractsQueryResult = await redb.manyOrNone(contractsQuery, {
              contracts: _.map(contracts, (c) => toBuffer(c)),
            });
            const contractsSet = new Map<string, string>();
            _.each(contractsQueryResult, (contract) =>
              contractsSet.set(fromBuffer(contract.address), contract.kind)
            );

            return _.map(response.data.bids, (bid) => ({
              ...bid,
              contract_kind: contractsSet.get(bid.contract),
            }));
          });

        return {
          orders: await Promise.all(
            result.map((r) =>
              getJoiOrderObject({
                id: `blur-collection-bid:${query.maker}:${r.contract}:${r.price}`,
                kind: "blur",
                side: "buy",
                status: "active",
                tokenSetId: `contract:${r.contract}`,
                tokenSetSchemaHash: toBuffer(HashZero),
                contract: toBuffer(r.contract),
                contractKind: r.contract_kind,
                maker: toBuffer(query.maker),
                taker: toBuffer(AddressZero),
                prices: {
                  gross: {
                    amount: parseEther(r.price).toString(),
                    nativeAmount: parseEther(r.price).toString(),
                  },
                  currency: toBuffer(Sdk.Blur.Addresses.Beth[config.chainId]),
                },
                validFrom: now().toString(),
                validUntil: "0",
                quantityFilled: "0",
                quantityRemaining: r.quantity.toString(),
                criteria: null,
                sourceIdInt: source!.id,
                feeBps: 0,
                feeBreakdown: [],
                expiration: "0",
                isReservoir: false,
                createdAt: now(),
                updatedAt: now(),
                originatedAt: now(),
                includeRawData: false,
                rawData: {} as any,
                normalizeRoyalties: false,
                missingRoyalties: [],
                includeDepth: false,
                displayCurrency: query.displayCurrency,
              })
            )
          ),
          continuation: null,
        };
      }

      const criteriaBuildQuery = Orders.buildCriteriaQuery(
        "orders",
        "token_set_id",
        query.includeCriteriaMetadata,
        "token_set_schema_hash"
      );

      const orderTypeJoin = query.orderType
        ? `JOIN token_sets ON token_sets.id = orders.token_set_id AND token_sets.schema_hash = orders.token_set_schema_hash`
        : "";

      let baseQuery = `
        SELECT
          contracts.kind AS "contract_kind",
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
              WHEN orders.approval_status = 'disabled' THEN 'inactive'
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
          coalesce(orders.fee_bps, 0) AS fee_bps,
          orders.fee_breakdown,
          COALESCE(
            NULLIF(DATE_PART('epoch', orders.expiration), 'Infinity'),
            0
          ) AS expiration,
          orders.is_reservoir,
          extract(epoch from orders.created_at) AS created_at,
          extract(epoch from orders.updated_at) AS updated_at,
          orders.originated_at,
          (${criteriaBuildQuery}) AS criteria
          ${query.includeRawData || query.includeDepth ? ", orders.raw_data" : ""}
        FROM orders
        ${orderTypeJoin}
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
                `EXISTS (SELECT FROM token_sets WHERE id = orders.token_set_id)`,
                `orders.side = 'buy'`,
              ]
            : [
                `orders.created_at >= to_timestamp($/startTimestamp/)`,
                `orders.created_at <= to_timestamp($/endTimestamp/)`,
                `EXISTS (SELECT FROM token_sets WHERE id = orders.token_set_id)`,
                `orders.side = 'buy'`,
              ]
          : [
              `EXISTS (SELECT FROM token_sets WHERE id = orders.token_set_id)`,
              `orders.side = 'buy'`,
            ];

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
          query.native)
      ) {
        throw Boom.badRequest(
          `Cannot filter with additional query params when sortBy = updatedAt and status != 'active.`
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
          break;
        }
        default: {
          orderStatusFilter = `orders.fillability_status = 'fillable' AND orders.approval_status = 'approved'`;
        }
      }

      if (query.tokenSetId) {
        conditions.push(`orders.token_set_id = $/tokenSetId/`);
      }

      if (query.token) {
        baseQuery += ` JOIN token_sets_tokens ON token_sets_tokens.token_set_id = orders.token_set_id AND token_sets_tokens.contract = orders.contract`;

        const [contract, tokenId] = query.token.split(":");

        (query as any).tokenContract = toBuffer(contract);
        (query as any).tokenId = tokenId;

        conditions.push(`token_sets_tokens.contract = $/tokenContract/`);
        conditions.push(`token_sets_tokens.token_id = $/tokenId/`);
      }

      if (query.collection && !query.attribute) {
        baseQuery += ` JOIN token_sets ON token_sets.id = orders.token_set_id AND token_sets.schema_hash = orders.token_set_schema_hash`;
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

        baseQuery += ` JOIN token_sets ON token_sets.id = orders.token_set_id AND token_sets.schema_hash = orders.token_set_schema_hash`;
        conditions.push(`token_sets.attribute_id IN ($/attributeIds:csv/)`);
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

        // collectionsSetId filter is valid only when maker filter is passed
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

        if (query.orderType) {
          switch (query.orderType) {
            case "token": {
              conditions.push(`orders.token_set_id LIKE 'token:%'`);
              break;
            }
            case "collection": {
              conditions.push(`(
                orders.token_set_id LIKE 'contract:%'
                OR orders.token_set_id LIKE 'range:%'
                OR (orders.token_set_id LIKE 'list:%' AND token_sets.attribute_id IS NULL)
                OR orders.token_set_id LIKE 'dynamic:collection-non-flagged:%'
              )`);
              break;
            }
            case "attribute": {
              conditions.push(
                `(orders.token_set_id LIKE 'list:%' AND token_sets.attribute_id IS NOT NULL)`
              );
              break;
            }
            case "custom": {
              conditions.push(`(
                orders.token_set_id LIKE 'list:%' 
                AND token_sets.collection_id IS NULL
                AND token_sets.attribute_id IS NULL
              )`);
              break;
            }
          }
        }
      }

      if (query.sources) {
        const sources = await Sources.getInstance();

        if (!Array.isArray(query.sources)) {
          query.sources = [query.sources];
        }

        (query as any).sourceIds = query.sources
          .map((source: string) => sources.getByDomain(source)?.id ?? 0)
          .filter((id: number) => id != 0);

        if (_.isEmpty(query.sourceIds)) {
          return { orders: [] };
        }

        conditions.push(`orders.source_id_int IN ($/sourceIds:csv/)`);
      }

      if (query.excludeSources) {
        const sources = await Sources.getInstance();

        if (!Array.isArray(query.excludeSources)) {
          query.excludeSources = [query.excludeSources];
        }

        (query as any).excludeSourceIds = query.excludeSources
          .map((source: string) => sources.getByDomain(source)?.id ?? 0)
          .filter((id: number) => id != 0);

        if (!_.isEmpty(query.excludeSourceIds)) {
          conditions.push(
            `orders.source_id_int IN (
                    SELECT id FROM sources_v2 sv
                    WHERE id NOT IN ($/excludeSourceIds:csv/)
                )`
          );
        }
      }

      if (query.native) {
        conditions.push(`orders.is_reservoir`);
      }

      if (!query.includePrivate) {
        conditions.push(
          `orders.taker = '\\x0000000000000000000000000000000000000000' OR orders.taker IS NULL`
        );
      }

      if (orderStatusFilter) {
        conditions.push(orderStatusFilter);
      }

      if (query.excludeEOA) {
        conditions.push(`orders.kind != 'blur'`);
      }

      if (query.continuation) {
        const [priceOrCreatedAtOrUpdatedAt, id] = splitContinuation(
          query.continuation,
          /^\d+(.\d+)?_0x[a-f0-9]{64}$/
        );
        (query as any).priceOrCreatedAtOrUpdatedAt = priceOrCreatedAtOrUpdatedAt;
        (query as any).id = id;

        if (query.sortBy === "price") {
          conditions.push(`(orders.value, orders.id) < ($/priceOrCreatedAtOrUpdatedAt/, $/id/)`);
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
        baseQuery += ` ORDER BY orders.value DESC, orders.id DESC`;
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

      const rawResult = await redb.manyOrNone(baseQuery, query);

      let continuation = null;
      if (rawResult.length === query.limit) {
        if (query.sortBy === "price") {
          continuation = buildContinuation(
            rawResult[rawResult.length - 1].price + "_" + rawResult[rawResult.length - 1].id
          );
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

      const result = rawResult.map(async (r) =>
        getJoiOrderObject({
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
              amount: r.currency_price ?? r.price,
              nativeAmount: r.price,
            },
            net: {
              amount: query.normalizeRoyalties
                ? r.currency_normalized_value ?? r.value
                : r.currency_value ?? r.value,
              nativeAmount: query.normalizeRoyalties ? r.normalized_value ?? r.value : r.value,
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
          includeDepth: query.includeDepth,
          displayCurrency: query.displayCurrency,
          token: query.token,
        })
      );

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
