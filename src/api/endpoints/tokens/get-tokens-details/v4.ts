/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import _ from "lodash";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import {
  base64Regex,
  buildContinuation,
  formatEth,
  fromBuffer,
  splitContinuation,
  toBuffer,
} from "@/common/utils";
import { Sources } from "@/models/sources";

const version = "v4";

export const getTokensDetailsV4Options: RouteOptions = {
  description: "Tokens (detailed response)",
  notes:
    "Get a list of tokens with full metadata. This is useful for showing a single token page, or scenarios that require more metadata. If you don't need this metadata, you should use the <a href='#/tokens/getTokensV1'>tokens</a> API, which is much faster.",
  tags: ["api", "Tokens"],
  plugins: {
    "hapi-swagger": {
      order: 9,
    },
  },
  validate: {
    query: Joi.object({
      collection: Joi.string()
        .lowercase()
        .description(
          "Filter to a particular collection with collection-id. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
      contract: Joi.string()
        .lowercase()
        .pattern(/^0x[a-fA-F0-9]{40}$/)
        .description(
          "Filter to a particular contract. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
      tokens: Joi.alternatives().try(
        Joi.array()
          .max(50)
          .items(
            Joi.string()
              .lowercase()
              .pattern(/^0x[a-fA-F0-9]{40}:[0-9]+$/)
          )
          .description(
            "Array of tokens. Example: `tokens[0]: 0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:704 tokens[1]: 0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:979`"
          ),
        Joi.string()
          .lowercase()
          .pattern(/^0x[a-fA-F0-9]{40}:[0-9]+$/)
          .description(
            "Array of tokens. Example: `tokens[0]: 0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:704 tokens[1]: 0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:979`"
          )
      ),
      tokenSetId: Joi.string()
        .lowercase()
        .description(
          "Filter to a particular token set. `Example: token:0xa7d8d9ef8d8ce8992df33d8b8cf4aebabd5bd270:129000685`"
        ),
      attributes: Joi.object()
        .unknown()
        .description("Filter to a particular attribute. Example: `attributes[Type]=Original`"),
      source: Joi.string().description("Name of the order source. Example `OpenSea`"),
      sortBy: Joi.string()
        .valid("floorAskPrice", "topBidValue")
        .default("floorAskPrice")
        .description("Order the items are returned in the response."),
      limit: Joi.number()
        .integer()
        .min(1)
        .max(50)
        .default(20)
        .description("Amount of items returned in response."),
      continuation: Joi.string()
        .pattern(base64Regex)
        .description("Use continuation token to request next offset of items."),
    })
      .or("collection", "contract", "tokens", "tokenSetId")
      .oxor("collection", "contract", "tokens", "tokenSetId")
      .with("attributes", "collection")
      .with("source", "collection"),
  },
  response: {
    schema: Joi.object({
      tokens: Joi.array().items(
        Joi.object({
          token: Joi.object({
            contract: Joi.string()
              .lowercase()
              .pattern(/^0x[a-fA-F0-9]{40}$/)
              .required(),
            tokenId: Joi.string()
              .pattern(/^[0-9]+$/)
              .required(),
            name: Joi.string().allow(null, ""),
            description: Joi.string().allow(null, ""),
            image: Joi.string().allow(null, ""),
            media: Joi.string().allow(null, ""),
            kind: Joi.string().allow(null, ""),
            collection: Joi.object({
              id: Joi.string().allow(null),
              name: Joi.string().allow(null, ""),
              image: Joi.string().allow(null, ""),
              slug: Joi.string().allow(null, ""),
            }),
            lastBuy: {
              value: Joi.number().unsafe().allow(null),
              timestamp: Joi.number().unsafe().allow(null),
            },
            lastSell: {
              value: Joi.number().unsafe().allow(null),
              timestamp: Joi.number().unsafe().allow(null),
            },
            owner: Joi.string().allow(null),
            attributes: Joi.array().items(
              Joi.object({
                key: Joi.string(),
                value: Joi.string(),
                tokenCount: Joi.number(),
                onSaleCount: Joi.number(),
                floorAskPrice: Joi.number().allow(null),
                topBidValue: Joi.number().allow(null),
              })
            ),
          }),
          market: Joi.object({
            floorAsk: {
              id: Joi.string().allow(null),
              price: Joi.number().unsafe().allow(null),
              maker: Joi.string()
                .lowercase()
                .pattern(/^0x[a-fA-F0-9]{40}$/)
                .allow(null),
              validFrom: Joi.number().unsafe().allow(null),
              validUntil: Joi.number().unsafe().allow(null),
              source: Joi.object().allow(null),
            },
            topBid: Joi.object({
              id: Joi.string().allow(null),
              value: Joi.number().unsafe().allow(null),
              maker: Joi.string()
                .lowercase()
                .pattern(/^0x[a-fA-F0-9]{40}$/)
                .allow(null),
              validFrom: Joi.number().unsafe().allow(null),
              validUntil: Joi.number().unsafe().allow(null),
            }),
          }),
        })
      ),
      continuation: Joi.string().pattern(base64Regex).allow(null),
    }).label(`getTokensDetails${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-tokens-details-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      let baseQuery = `
        SELECT
          "t"."contract",
          "t"."token_id",
          "t"."name",
          "t"."description",
          "t"."image",
          "t"."media",
          "t"."collection_id",
          "c"."name" as "collection_name",
          "con"."kind",
          ("c".metadata ->> 'imageUrl')::TEXT AS "collection_image",
          "c"."slug",
          "t"."last_buy_value",
          "t"."last_buy_timestamp",
          "t"."last_sell_value",
          "t"."last_sell_timestamp",
          (
            SELECT "nb"."owner" FROM "nft_balances" "nb"
            WHERE "nb"."contract" = "t"."contract"
              AND "nb"."token_id" = "t"."token_id"
              AND "nb"."amount" > 0
            LIMIT 1
          ) AS "owner",
          (
            SELECT
              array_agg(json_build_object('key', "ta"."key",
                                          'value', "ta"."value",
                                          'tokenCount', attributes.token_count,
                                          'onSaleCount', attributes.on_sale_count,
                                          'floorAskPrice', attributes.floor_sell_value::text,
                                          'topBidValue', attributes.top_buy_value::text))
            FROM "token_attributes" "ta"
            JOIN attributes ON "ta".attribute_id = attributes.id
            WHERE "ta"."contract" = "t"."contract"
            AND "ta"."token_id" = "t"."token_id"
            AND "ta"."key" != ''
          ) AS "attributes",
          "t"."floor_sell_id",
          "t"."floor_sell_value",
          "t"."floor_sell_maker",
          "t"."floor_sell_valid_from",
          "t"."floor_sell_valid_to",
          "t"."floor_sell_source_id",
          "t"."top_buy_id",
          "t"."top_buy_value",
          "t"."top_buy_maker",
          DATE_PART('epoch', LOWER("ob"."valid_between")) AS "top_buy_valid_from",
          COALESCE(
            NULLIF(DATE_PART('epoch', UPPER("ob"."valid_between")), 'Infinity'),
            0
          ) AS "top_buy_valid_until"
        FROM "tokens" "t"
        LEFT JOIN "orders" "ob"
          ON "t"."top_buy_id" = "ob"."id"
        JOIN "collections" "c"
          ON "t"."collection_id" = "c"."id"
        JOIN "contracts" "con"
          ON "t"."contract" = "con"."address"
      `;

      if (query.tokenSetId) {
        baseQuery += `
          JOIN "token_sets_tokens" "tst"
            ON "t"."contract" = "tst"."contract"
            AND "t"."token_id" = "tst"."token_id"
        `;
      }

      if (query.attributes) {
        const attributes: { key: string; value: any }[] = [];
        Object.entries(query.attributes).forEach(([key, value]) => attributes.push({ key, value }));

        for (let i = 0; i < attributes.length; i++) {
          const multipleSelection = Array.isArray(attributes[i].value);

          (query as any)[`key${i}`] = attributes[i].key;
          (query as any)[`value${i}`] = attributes[i].value;

          baseQuery += `
            JOIN "token_attributes" "ta${i}"
              ON "t"."contract" = "ta${i}"."contract"
              AND "t"."token_id" = "ta${i}"."token_id"
              AND "ta${i}"."key" = $/key${i}/
              AND "ta${i}"."value" ${multipleSelection ? `IN ($/value${i}:csv/)` : `= $/value${i}/`}
          `;
        }
      }

      // Filters
      const conditions: string[] = [];
      if (query.collection) {
        conditions.push(`"t"."collection_id" = $/collection/`);
      }

      if (query.contract) {
        (query as any).contract = toBuffer(query.contract);
        conditions.push(`"t"."contract" = $/contract/`);
      }

      if (query.tokens) {
        if (!_.isArray(query.tokens)) {
          query.tokens = [query.tokens];
        }

        for (const token of query.tokens) {
          const [contract, tokenId] = token.split(":");
          const tokensFilter = `('${_.replace(contract, "0x", "\\x")}', '${tokenId}')`;

          if (_.isUndefined((query as any).tokensFilter)) {
            (query as any).tokensFilter = [];
          }

          (query as any).tokensFilter.push(tokensFilter);
        }

        (query as any).tokensFilter = _.join((query as any).tokensFilter, ",");

        conditions.push(`("t"."contract", "t"."token_id") IN ($/tokensFilter:raw/)`);
      }

      if (query.tokenSetId) {
        conditions.push(`"tst"."token_set_id" = $/tokenSetId/`);
      }

      if (query.source) {
        const sources = await Sources.getInstance();
        const source = sources.getByName(query.source);
        (query as any).sourceAddress = toBuffer(source.address);
        conditions.push(`"t"."floor_sell_source_id" = $/sourceAddress/`);
      }

      // Continue with the next page, this depends on the sorting used
      if (query.continuation && !query.token) {
        const contArr = splitContinuation(query.continuation, /^((\d+|null)_\d+|\d+)$/);

        if (query.collection || query.attributes) {
          if (contArr.length !== 2) {
            logger.error(
              "get-tokens",
              JSON.stringify({
                msg: "Invalid continuation string used",
                params: request.query,
              })
            );

            throw new Error("Invalid continuation string used");
          }
          switch (query.sortBy) {
            case "topBidValue":
              if (contArr[0] !== "null") {
                conditions.push(`
                  ("t"."top_buy_value", "t"."token_id") < ($/topBuyValue:raw/, $/tokenId:raw/)
                  OR (t.top_buy_value is null)
                 `);
                (query as any).topBuyValue = contArr[0];
                (query as any).tokenId = contArr[1];
              } else {
                conditions.push(`(t.top_buy_value is null AND t.token_id < $/tokenId/)`);
                (query as any).tokenId = contArr[1];
              }
              break;
            case "floorAskPrice":
            default:
              if (contArr[0] !== "null") {
                conditions.push(`(
                  (t.floor_sell_value, "t"."token_id") > ($/floorSellValue/, $/tokenId/)
                  OR (t.floor_sell_value is null)
                )
                `);
                (query as any).floorSellValue = contArr[0];
                (query as any).tokenId = contArr[1];
              } else {
                conditions.push(`(t.floor_sell_value is null AND t.token_id > $/tokenId/)`);
                (query as any).tokenId = contArr[1];
              }
              break;
          }
        } else {
          conditions.push(`"t"."token_id" > $/tokenId/`);
          (query as any).tokenId = contArr[1] ? contArr[1] : contArr[0];
        }
      }

      if (conditions.length) {
        baseQuery += " WHERE " + conditions.map((c) => `(${c})`).join(" AND ");
      }

      // Sorting
      // Only allow sorting on floorSell and topBid when we filter by collection or attributes
      if (query.collection || query.attributes) {
        switch (query.sortBy) {
          case "topBidValue": {
            baseQuery += ` ORDER BY "t"."top_buy_value" DESC NULLS LAST, "t"."token_id" DESC`;
            break;
          }

          case "floorAskPrice":
          default: {
            baseQuery += ` ORDER BY "t"."floor_sell_value" ASC NULLS LAST, "t"."token_id"`;
            break;
          }
        }
      } else if (query.contract) {
        baseQuery += ` ORDER BY "t"."token_id" ASC`;
      }

      baseQuery += ` LIMIT $/limit/`;

      const rawResult = await redb.manyOrNone(baseQuery, query);

      /** Depending on how we sorted, we use that sorting key to determine the next page of results
          Possible formats:
            topBidValue_tokenid
            floorAskPrice_tokenid
            tokenid
       **/
      let continuation = null;
      if (rawResult.length === query.limit) {
        continuation = "";

        // Only build a "value_tokenid" continuation string when we filter on collection or attributes
        // Otherwise continuation string will just be based on the last tokenId. This is because only use sorting
        // when we have collection/attributes
        if (query.collection || query.attributes) {
          switch (query.sortBy) {
            case "topBidValue":
              continuation = rawResult[rawResult.length - 1].top_buy_value || "null";
              break;
            case "floorAskPrice":
              continuation = rawResult[rawResult.length - 1].floor_sell_value || "null";
              break;
            default:
              break;
          }

          continuation += "_" + rawResult[rawResult.length - 1].token_id;
        } else {
          continuation = rawResult[rawResult.length - 1].token_id;
        }

        continuation = buildContinuation(continuation);
      }

      const sources = await Sources.getInstance();

      const result = rawResult.map((r) => {
        const source = r.floor_sell_source_id
          ? sources.getByAddress(
              fromBuffer(r.floor_sell_source_id),
              fromBuffer(r.contract),
              r.token_id
            )
          : null;

        return {
          token: {
            contract: fromBuffer(r.contract),
            tokenId: r.token_id,
            name: r.name,
            description: r.description,
            image: r.image,
            media: r.media,
            kind: r.kind,
            collection: {
              id: r.collection_id,
              name: r.collection_name,
              image: r.collection_image,
              slug: r.slug,
            },
            lastBuy: {
              value: r.last_buy_value ? formatEth(r.last_buy_value) : null,
              timestamp: r.last_buy_timestamp,
            },
            lastSell: {
              value: r.last_sell_value ? formatEth(r.last_sell_value) : null,
              timestamp: r.last_sell_timestamp,
            },
            owner: r.owner ? fromBuffer(r.owner) : null,
            attributes: r.attributes
              ? _.map(r.attributes, (attribute) => ({
                  key: attribute.key,
                  value: attribute.value,
                  tokenCount: attribute.tokenCount,
                  onSaleCount: attribute.onSaleCount,
                  floorAskPrice: attribute.floorAskPrice
                    ? formatEth(attribute.floorAskPrice)
                    : attribute.floorAskPrice,
                  topBidValue: attribute.topBidValue
                    ? formatEth(attribute.topBidValue)
                    : attribute.topBidValue,
                }))
              : [],
          },
          market: {
            floorAsk: {
              id: r.floor_sell_id,
              price: r.floor_sell_value ? formatEth(r.floor_sell_value) : null,
              maker: r.floor_sell_maker ? fromBuffer(r.floor_sell_maker) : null,
              validFrom: r.floor_sell_value ? r.floor_sell_valid_from : null,
              validUntil: r.floor_sell_value ? r.floor_sell_valid_to : null,
              source: {
                id: source?.address,
                name: source?.name,
                icon: source?.metadata.icon,
                url: source?.metadata.url,
              },
            },
            topBid: {
              id: r.top_buy_id,
              value: r.top_buy_value ? formatEth(r.top_buy_value) : null,
              maker: r.top_buy_maker ? fromBuffer(r.top_buy_maker) : null,
              validFrom: r.top_buy_valid_from,
              validUntil: r.top_buy_value ? r.top_buy_valid_until : null,
            },
          },
        };
      });

      return {
        tokens: await Promise.all(result),
        continuation,
      };
    } catch (error) {
      logger.error(`get-tokens-details-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
