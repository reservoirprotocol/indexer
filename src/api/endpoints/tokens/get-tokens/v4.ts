/* eslint-disable @typescript-eslint/no-explicit-any */

import { Sources } from "@/models/sources";
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

const version = "v4";

export const getTokensV4Options: RouteOptions = {
  description: "Tokens",
  notes:
    "This API is optimized for quickly fetching a list of tokens in a collection, sorted by price, with only the most important information returned. If you need more metadata, use the tokens/details API",
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
        .pattern(regex.address)
        .description(
          "Filter to a particular contract. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
      tokens: Joi.alternatives().try(
        Joi.array()
          .max(50)
          .items(Joi.string().lowercase().pattern(regex.token))
          .description(
            "Array of tokens. Example: `tokens[0]: 0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:704tokens[1]: 0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:979`"
          ),
        Joi.string()
          .lowercase()
          .pattern(regex.token)
          .description(
            "Array of tokens. Example: `tokens[0]: 0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:704 tokens[1]: 0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:979`"
          )
      ),
      tokenSetId: Joi.string()
        .lowercase()
        .description(
          "Filter to a particular token set. Example: token:0xa7d8d9ef8d8ce8992df33d8b8cf4aebabd5bd270:129000685"
        ),
      attributes: Joi.object()
        .unknown()
        .description("Filter to a particular attribute. Example: `attributes[Type]=Original`"),
      source: Joi.string().description("Name of the order source. Example `OpenSea`"),
      native: Joi.boolean().description("If true, results will filter only Reservoir orders."),
      sortBy: Joi.string()
        .allow("floorAskPrice", "tokenId", "rarity")
        .when("contract", {
          is: Joi.exist(),
          then: Joi.invalid("floorAskPrice", "rarity"),
        })
        .default((parent) => (parent && parent.contract ? "tokenId" : "floorAskPrice"))
        .description(
          "Order the items are returned in the response, by default sorted by `floorAskPrice`. Not supported when filtering by `contract`. When filtering by `contract` the results are sorted by `tokenId` by default."
        ),
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
      .with("source", "collection")
      .with("native", "collection"),
  },
  response: {
    schema: Joi.object({
      tokens: Joi.array().items(
        Joi.object({
          contract: Joi.string().lowercase().pattern(regex.address).required(),
          tokenId: Joi.string().pattern(regex.number).required(),
          name: Joi.string().allow(null, ""),
          image: Joi.string().allow(null, ""),
          media: Joi.string().allow(null, ""),
          collection: Joi.object({
            id: Joi.string().allow(null),
            name: Joi.string().allow(null, ""),
            image: Joi.string().allow(null, ""),
            slug: Joi.string().allow(null, ""),
          }),
          source: Joi.string().allow(null, ""),
          topBidValue: Joi.number().unsafe().allow(null).optional(),
          floorAskPrice: Joi.number().unsafe().allow(null),
          rarity: Joi.number().unsafe().allow(null),
          rarityRank: Joi.number().unsafe().allow(null),
          owner: Joi.string().allow(null, ""),
        })
      ),
      continuation: Joi.string().pattern(regex.base64).allow(null),
    }).label(`getTokens${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-tokens-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    let selectTopBid = "";
    let topBidQuery = "";
    if (query.includeTopBid) {
      selectTopBid = "y.top_buy_value,";
      topBidQuery = `
        LEFT JOIN LATERAL (
          SELECT o.value AS "top_buy_value"
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
          "t"."image",
          "t"."media",
          "t"."collection_id",
          "c"."name" as "collection_name",
          "t"."floor_sell_source_id_int",
          ("c".metadata ->> 'imageUrl')::TEXT AS "collection_image",
          "c"."slug",
          "t"."floor_sell_value",
          ${selectTopBid}
          "t"."rarity_score",
          "t"."rarity_rank",
          (
            SELECT owner
            FROM "nft_balances" "nb"
            WHERE nb.contract = "t"."contract"
            AND nb.token_id = "t"."token_id"
            AND nb.amount > 0
            LIMIT 1
          ) AS "owner"
        FROM "tokens" "t"
        ${topBidQuery}
        JOIN "collections" "c" ON "t"."collection_id" = "c"."id"
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

      if (query.native) {
        conditions.push(`"t"."floor_sell_is_reservoir"`);
      }

      // Continue with the next page, this depends on the sorting used
      if (query.continuation && !query.tokens) {
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

            throw new Error("Invalid continuation string used");
          }

          switch (query.sortBy) {
            case "rarity": {
              conditions.push(
                `("t"."rarity_score", "t"."token_id") < ($/contRarity/, $/contTokenId/)`
              );
              (query as any).contRarity = contArr[0];
              (query as any).contTokenId = contArr[1];
              break;
            }

            case "tokenId": {
              conditions.push(
                `("t"."contract", "t"."token_id") > ($/contContract/, $/contTokenId/)`
              );
              (query as any).contContract = toBuffer(contArr[0]);
              (query as any).contTokenId = contArr[1];
              break;
            }

            case "floorAskPrice":
            default: {
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
      // Only allow sorting on floorSell / tokenId / rarity when we filter by collection or attributes
      if (query.collection || query.attributes || query.tokenSetId) {
        switch (query.sortBy) {
          case "rarity": {
            baseQuery += ` ORDER BY "t"."rarity_score" DESC NULLS LAST, "t"."token_id" DESC`;
            break;
          }

          case "tokenId": {
            baseQuery += ` ORDER BY "t"."contract", "t"."token_id"`;
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
            rarity_tokenid
            floorAskPrice_tokenid
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
            case "rarity":
              continuation = rawResult[rawResult.length - 1].rarity_score || "null";
              break;

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
      const result = rawResult.map((r) => {
        return {
          contract: fromBuffer(r.contract),
          tokenId: r.token_id,
          name: r.name,
          image: r.image,
          media: r.media,
          collection: {
            id: r.collection_id,
            name: r.collection_name,
            image: r.collection_image,
            slug: r.slug,
          },
          source: sources.get(r.floor_sell_source_id_int)?.name,
          floorAskPrice: r.floor_sell_value ? formatEth(r.floor_sell_value) : null,
          topBidValue: query.includeTopBid
            ? r.top_buy_value
              ? formatEth(r.top_buy_value)
              : null
            : undefined,
          rarity: r.rarity_score,
          rarityRank: r.rarity_rank,
          owner: r.owner ? fromBuffer(r.owner) : null,
        };
      });

      return {
        tokens: result,
        continuation,
      };
    } catch (error) {
      logger.error(`get-tokens-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
