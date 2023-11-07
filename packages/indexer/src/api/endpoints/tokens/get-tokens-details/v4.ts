/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import _ from "lodash";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import {
  buildContinuation,
  formatEth,
  fromBuffer,
  regex,
  splitContinuation,
  toBuffer,
} from "@/common/utils";
import { Sources } from "@/models/sources";
import { Assets } from "@/utils/assets";
import { JoiAttributeValue, JoiSource, getJoiSourceObject, getJoiTokenObject } from "@/common/joi";
import * as Boom from "@hapi/boom";

const version = "v4";

export const getTokensDetailsV4Options: RouteOptions = {
  description: "Tokens (detailed response)",
  notes:
    "Get a list of tokens with full metadata. This is useful for showing a single token page, or scenarios that require more metadata. If you don't need this metadata, you should use the <a href='#/tokens/getTokensV1'>tokens</a> API, which is much faster.",
  tags: ["api", "x-deprecated"],
  plugins: {
    "hapi-swagger": {
      deprecated: true,
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
        .pattern(regex.address)
        .description(
          "Filter to a particular contract. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
      tokens: Joi.alternatives().try(
        Joi.array()
          .max(50)
          .items(Joi.string().lowercase().pattern(regex.token))
          .description(
            "Array of tokens. Example: `tokens[0]: 0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:704 tokens[1]: 0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:979`"
          ),
        Joi.string()
          .lowercase()
          .pattern(regex.token)
          .description(
            "Array of tokens. Example: `tokens[0]: 0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:704 tokens[1]: 0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:979`"
          )
      ),
      tokenSetId: Joi.string().description(
        "Filter to a particular token set. `Example: token:0xa7d8d9ef8d8ce8992df33d8b8cf4aebabd5bd270:129000685`"
      ),
      attributes: Joi.object()
        .unknown()
        .description("Filter to a particular attribute. Example: `attributes[Type]=Original`"),
      source: Joi.string().description("Domain of the order source. Example `opensea.io`"),
      sortBy: Joi.string()
        .valid("floorAskPrice", "tokenId")
        .default("floorAskPrice")
        .description("Order the items are returned in the response."),
      sortDirection: Joi.string().lowercase().valid("asc", "desc"),
      limit: Joi.number()
        .integer()
        .min(1)
        .max(50)
        .default(20)
        .description("Amount of items returned in response."),
      includeTopBid: Joi.boolean()
        .default(false)
        .description("If true, top bid will be returned in the response."),
      continuation: Joi.string()
        .pattern(regex.base64)
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
            contract: Joi.string().lowercase().pattern(regex.address).required(),
            tokenId: Joi.string().pattern(regex.number).required(),
            name: Joi.string().allow("", null),
            description: Joi.string().allow("", null),
            image: Joi.string().allow("", null),
            media: Joi.string().allow("", null),
            kind: Joi.string().allow("", null),
            isFlagged: Joi.boolean().default(false),
            lastFlagUpdate: Joi.string().allow("", null),
            collection: Joi.object({
              id: Joi.string().allow(null),
              name: Joi.string().allow("", null),
              image: Joi.string().allow("", null),
              slug: Joi.string().allow("", null),
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
                value: JoiAttributeValue,
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
              maker: Joi.string().lowercase().pattern(regex.address).allow(null),
              validFrom: Joi.number().unsafe().allow(null),
              validUntil: Joi.number().unsafe().allow(null),
              source: JoiSource.allow(null),
            },
            topBid: Joi.object({
              id: Joi.string().allow(null),
              value: Joi.number().unsafe().allow(null),
              maker: Joi.string().lowercase().pattern(regex.address).allow(null),
              validFrom: Joi.number().unsafe().allow(null),
              validUntil: Joi.number().unsafe().allow(null),
            }).optional(),
          }),
        })
      ),
      continuation: Joi.string().pattern(regex.base64).allow(null),
    }).label(`getTokensDetails${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-tokens-details-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    let selectTopBid = "";
    let topBidQuery = "";
    if (query.includeTopBid) {
      selectTopBid = "y.top_buy_id, y.top_buy_value, y.top_buy_maker,";
      topBidQuery = `
        LEFT JOIN LATERAL (
          SELECT o.id AS "top_buy_id", o.value AS "top_buy_value", o.maker AS "top_buy_maker"
          FROM "orders" "o"
          JOIN "token_sets_tokens" "tst" ON "o"."token_set_id" = "tst"."token_set_id"
          WHERE "tst"."contract" = "t"."contract"
          AND "tst"."token_id" = "t"."token_id"
          AND "o"."side" = 'buy'
          AND "o"."fillability_status" = 'fillable'
          AND "o"."approval_status" = 'approved'
          AND EXISTS(
            SELECT FROM "nft_balances" "nb"
              WHERE "nb"."contract" = "t"."contract"
              AND "nb"."token_id" = "t"."token_id"
              AND "nb"."amount" > 0
              AND "nb"."owner" != "o"."maker"
          )
          ORDER BY "o"."value" DESC
          LIMIT 1
        ) "y" ON TRUE
      `;
    }

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
          "t"."metadata_disabled" as "t_metadata_disabled",
          "c"."metadata_disabled" as "c_metadata_disabled",
          "c"."name" as "collection_name",
          "con"."kind",
          "t"."is_flagged",
          "t"."last_flag_update",
          "c"."slug",
          "t"."last_buy_value",
          "t"."last_buy_timestamp",
          "t"."last_sell_value",
          "t"."last_sell_timestamp",
          ("c".metadata ->> 'imageUrl')::TEXT AS "collection_image",
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
          "t"."floor_sell_source_id_int",
          ${selectTopBid}
          DATE_PART('epoch', LOWER("ob"."valid_between")) AS "top_buy_valid_from",
          COALESCE(
            NULLIF(DATE_PART('epoch', UPPER("ob"."valid_between")), 'Infinity'),
            0
          ) AS "top_buy_valid_until"
        FROM "tokens" "t"
        ${topBidQuery}
        LEFT JOIN "orders" "ob" ON "t"."top_buy_id" = "ob"."id"
        JOIN "collections" "c" ON "t"."collection_id" = "c"."id"
        JOIN "contracts" "con" ON "t"."contract" = "con"."address"
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
        let source = sources.getByName(query.source, false);
        if (!source) {
          source = sources.getByDomain(query.source);
        }

        (query as any).source = source?.id;
        conditions.push(`"t"."floor_sell_source_id_int" = $/source/`);
      }

      // Continue with the next page, this depends on the sorting used
      if (query.continuation && !query.token) {
        const contArr = splitContinuation(
          query.continuation,
          /^((([0-9]+\.?[0-9]*|\.[0-9]+)|null|0x[a-fA-F0-9]+)_\d+|\d+)$/
        );

        if (query.collection || query.attributes || query.tokenSetId) {
          if (contArr.length !== 2) {
            logger.error(
              "get-tokens",
              JSON.stringify({
                msg: "Invalid continuation string used",
                params: request.query,
              })
            );

            throw Boom.badRequest("Invalid continuation string used");
          }

          switch (query.sortBy) {
            case "tokenId": {
              const sign = query.sortDirection == "desc" ? "<" : ">";
              conditions.push(
                `("t"."contract", "t"."token_id") ${sign} ($/contContract/, $/contTokenId/)`
              );
              (query as any).contContract = toBuffer(contArr[0]);
              (query as any).contTokenId = contArr[1];
              break;
            }

            case "floorAskPrice":
            default:
              {
                const sign = query.sortDirection == "desc" ? "<" : ">";

                if (contArr[0] !== "null") {
                  conditions.push(`(
                  (t.floor_sell_value, "t"."token_id") ${sign} ($/floorSellValue/, $/tokenId/)
                  OR (t.floor_sell_value is null)
                )
                `);
                  (query as any).floorSellValue = contArr[0];
                  (query as any).tokenId = contArr[1];
                } else {
                  conditions.push(`(t.floor_sell_value is null AND t.token_id ${sign} $/tokenId/)`);
                  (query as any).tokenId = contArr[1];
                }
              }
              break;
          }
        } else {
          const sign = query.sortDirection == "desc" ? "<" : ">";
          conditions.push(`"t"."token_id" ${sign} $/tokenId/`);
          (query as any).tokenId = contArr[1] ? contArr[1] : contArr[0];
        }
      }

      if (conditions.length) {
        baseQuery += " WHERE " + conditions.map((c) => `(${c})`).join(" AND ");
      }

      // Sorting
      // Only allow sorting on floorSell when we filter by collection / attributes / tokenSetId
      if (query.collection || query.attributes || query.tokenSetId) {
        switch (query.sortBy) {
          case "tokenId": {
            baseQuery += ` ORDER BY "t"."contract", "t"."token_id" ${query.sortDirection || "ASC"}`;
            break;
          }

          case "floorAskPrice":
          default: {
            baseQuery += ` ORDER BY "t"."floor_sell_value" ${
              query.sortDirection || "ASC"
            } NULLS LAST, "t"."token_id"`;
            break;
          }
        }
      } else if (query.contract) {
        baseQuery += ` ORDER BY "t"."token_id" ${query.sortDirection || "ASC"}`;
      }

      baseQuery += ` LIMIT $/limit/`;

      const rawResult = await redb.manyOrNone(baseQuery, query);

      /** Depending on how we sorted, we use that sorting key to determine the next page of results
          Possible formats:
            floorAskPrice_tokenid
            contract_tokenid
            tokenid
       **/
      let continuation = null;
      if (rawResult.length === query.limit) {
        continuation = "";

        // Only build a "value_tokenid" continuation string when we filter on collection or attributes
        // Otherwise continuation string will just be based on the last tokenId. This is because only use sorting
        // when we have collection/attributes
        if (query.collection || query.attributes || query.tokenSetId) {
          switch (query.sortBy) {
            case "tokenId":
              continuation = fromBuffer(rawResult[rawResult.length - 1].contract);
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

      const result = rawResult.map(async (r) => {
        const contract = fromBuffer(r.contract);
        const tokenId = r.token_id;

        const source = r.floor_sell_value
          ? sources.get(Number(r.floor_sell_source_id_int), contract, tokenId)
          : undefined;

        return {
          token: getJoiTokenObject(
            {
              contract,
              tokenId,
              name: r.name,
              description: r.description,
              image: Assets.getLocalAssetsLink(r.image),
              media: r.media,
              kind: r.kind,
              isFlagged: Boolean(Number(r.is_flagged)),
              lastFlagUpdate: r.last_flag_update
                ? new Date(r.last_flag_update).toISOString()
                : null,
              collection: {
                id: r.collection_id,
                name: r.collection_name,
                image: Assets.getLocalAssetsLink(r.image),
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
            r.t_metadata_disabled,
            r.c_metadata_disabled
          ),
          market: {
            floorAsk: {
              id: r.floor_sell_id,
              price: r.floor_sell_value ? formatEth(r.floor_sell_value) : null,
              maker: r.floor_sell_maker ? fromBuffer(r.floor_sell_maker) : null,
              validFrom: r.floor_sell_value ? r.floor_sell_valid_from : null,
              validUntil: r.floor_sell_value ? r.floor_sell_valid_to : null,
              source: getJoiSourceObject(source),
            },
            topBid: query.includeTopBid
              ? {
                  id: r.top_buy_id,
                  value: r.top_buy_value ? formatEth(r.top_buy_value) : null,
                  maker: r.top_buy_maker ? fromBuffer(r.top_buy_maker) : null,
                  validFrom: r.top_buy_valid_from,
                  validUntil: r.top_buy_value ? r.top_buy_valid_until : null,
                }
              : undefined,
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
