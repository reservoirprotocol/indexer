/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";

import { idb, pgp, redb } from "@/common/db";
import { fromBuffer, now, toBuffer } from "@/common/utils";
import {
  TokensEntity,
  TokensEntityParams,
  TokensEntityUpdateParams,
} from "@/models/tokens/tokens-entity";
import { config } from "@/config/index";
import { orderUpdatesByIdJob } from "@/jobs/order-updates/order-updates-by-id-job";
import { CollectionsEntity } from "@/models/collections/collections-entity";

export type TokenAttributes = {
  attributeId: number;
  key: string;
  value: string;
  attributeKeyId: number;
  collectionId: string;
  floorSellValue: number | null;
  tokenCount: number;
};

export class Tokens {
  public static async getByContractAndTokenId(
    contract: string,
    tokenId: string,
    readReplica = false
  ) {
    const dbInstance = readReplica ? redb : idb;
    const token: TokensEntityParams | null = await dbInstance.oneOrNone(
      `SELECT *
              FROM tokens
              WHERE contract = $/contract/
              AND token_id = $/tokenId/`,
      {
        contract: toBuffer(contract),
        tokenId,
      }
    );

    if (token) {
      return new TokensEntity(token);
    }

    return null;
  }

  public static async getCollection(contract: string, tokenId: string) {
    const collection = await redb.oneOrNone(
      `SELECT *
              FROM collections
              WHERE id = (
                SELECT collection_id
                FROM tokens
                WHERE contract = $/contract/
                AND token_id = $/tokenId/
              )`,
      {
        contract: toBuffer(contract),
        tokenId,
      }
    );

    if (collection) {
      return new CollectionsEntity(collection);
    }

    return null;
  }

  public static async getCollectionIds(tokens: { contract: string; tokenId: string }[]) {
    const map = new Map<string, string>();
    const columns = new pgp.helpers.ColumnSet(["contract", "token_id"], { table: "tokens" });

    const data = tokens.map((activity) => ({
      contract: toBuffer(activity.contract),
      token_id: activity.tokenId,
    }));

    const collectionIds = await redb.manyOrNone(
      `SELECT contract, token_id, collection_id
        FROM tokens
        WHERE (contract, token_id) IN (${pgp.helpers.values(data, columns)})`
    );

    if (collectionIds) {
      _.map(collectionIds, (c) =>
        map.set(`${fromBuffer(c.contract)}:${c.token_id}`, c.collection_id)
      );
      return map;
    }

    return null;
  }

  public static async update(contract: string, tokenId: string, fields: TokensEntityUpdateParams) {
    let updateString = "";
    const replacementValues = {
      contract: toBuffer(contract),
      tokenId,
    };

    _.forEach(fields, (value, fieldName) => {
      updateString += `${_.snakeCase(fieldName)} = $/${fieldName}/,`;
      (replacementValues as any)[fieldName] = value;
    });

    updateString = _.trimEnd(updateString, ",");

    const query = `UPDATE tokens
                   SET updated_at = now(),
                   ${updateString}
                   WHERE contract = $/contract/
                   AND token_id = $/tokenId/`;

    return await idb.none(query, replacementValues);
  }

  public static async getTokenAttributes(contract: string, tokenId: string, maxTokenCount = 0) {
    const query = `SELECT attribute_id AS "attributeId", token_attributes.key, token_attributes.value, attribute_key_id AS "attributeKeyId",
                          token_attributes.collection_id AS "collectionId", floor_sell_value AS "floorSellValue", token_count AS "tokenCount"
                   FROM token_attributes
                   JOIN attributes ON token_attributes.attribute_id = attributes.id
                   WHERE contract = $/contract/
                   AND token_id = $/tokenId/
                   ${maxTokenCount ? "AND token_count <= $/maxTokenCount/" : ""}`;

    return (await redb.manyOrNone(query, {
      contract: toBuffer(contract),
      tokenId,
      maxTokenCount,
    })) as TokenAttributes[];
  }

  public static async getTokenAttributesKeyCount(collection: string, key: string) {
    const query = `SELECT count(DISTINCT value) AS count
                   FROM token_attributes
                   WHERE collection_id = $/collection/
                   and key = $/key/
                   GROUP BY key`;

    return await redb.oneOrNone(query, {
      collection,
      key,
    });
  }

  public static async getTokenAttributesValueCount(collection: string, key: string, value: string) {
    const query = `
      SELECT
        (
          SELECT attribute_id
          FROM token_attributes
          WHERE collection_id = $/collection/
            AND key = $/key/
            AND value = $/value/
          LIMIT 1
        ) AS attributeId,
        (
          SELECT COUNT(*)
          FROM token_attributes
          WHERE collection_id = $/collection/
            AND key = $/key/
            AND value = $/value/
        ) AS count
    `;

    return await redb.oneOrNone(query, {
      collection,
      key,
      value,
    });
  }

  public static async getSingleToken(collectionId: string) {
    const query = `
        SELECT token_id
        FROM tokens
        WHERE collection_id = $/collectionId/
        LIMIT 1
      `;

    const result = await redb.oneOrNone(query, {
      collectionId,
    });

    if (result) {
      return result.token_id;
    }

    return null;
  }

  public static async getTokenIdsInCollection(
    collectionId: string,
    contract = "",
    nonFlaggedOnly = false,
    readReplica = true
  ) {
    const dbInstance = readReplica ? redb : idb;
    const limit = 10000;
    let checkForMore = true;
    let continuation = "";
    let tokenIds: string[] = [];
    let flagFilter = "";
    let contractFilter = "";

    if (config.chainId === 1 && nonFlaggedOnly) {
      flagFilter = "AND (is_flagged = 0 OR is_flagged IS NULL)";
    }

    if (contract) {
      contractFilter = "AND contract = $/contract/";
    }

    while (checkForMore) {
      const query = `
        SELECT token_id
        FROM tokens
        WHERE collection_id = $/collectionId/
        ${contractFilter}
        ${flagFilter}
        ${continuation}
        ORDER BY contract, token_id ASC
        LIMIT ${limit}
      `;

      const result = await dbInstance.manyOrNone(query, {
        contract: toBuffer(contract),
        collectionId,
      });

      if (!_.isEmpty(result)) {
        tokenIds = _.concat(
          tokenIds,
          _.map(result, (r) => r.token_id)
        );
        continuation = `AND token_id > ${_.last(result).token_id}`;
      }

      if (limit > _.size(result)) {
        checkForMore = false;
      }
    }

    return tokenIds;
  }

  /**
   * Return the lowest sell price and number of tokens on sale for the given attribute
   * @param collection
   * @param attributeKey
   * @param attributeValue
   */
  public static async getSellFloorValueAndOnSaleCount(
    collection: string,
    attributeKey: string,
    attributeValue: string
  ) {
    const query = `WITH x AS (
      SELECT 
        COUNT(*) AS "onSaleCount" 
      FROM 
        token_attributes 
        JOIN tokens ON token_attributes.contract = tokens.contract 
        AND token_attributes.token_id = tokens.token_id 
      WHERE 
        token_attributes.collection_id = $/collection/
        AND key = $/attributeKey/ 
        AND value = $/attributeValue/
        AND floor_sell_value IS NOT NULL
    ) 
    SELECT 
      x."onSaleCount", 
      CASE WHEN x."onSaleCount" = 0 THEN NULL ELSE (
        SELECT 
          json_build_object(
            'id', floor_sell_id,
            'value', floor_sell_value, 
            'currency', floor_sell_currency, 
            'currencyValue', floor_sell_currency_value, 
            'maker', floor_sell_maker,
            'validFrom', floor_sell_valid_from,
            'validTo', floor_sell_valid_to,
            'sourceIdInt', floor_sell_source_id_int
          ) 
        FROM 
          token_attributes 
          JOIN tokens ON token_attributes.contract = tokens.contract 
          AND token_attributes.token_id = tokens.token_id 
        WHERE 
          token_attributes.collection_id = $/collection/
          AND key = $/attributeKey/
          AND value = $/attributeValue/
          AND floor_sell_value IS NOT NULL 
        ORDER BY 
          floor_sell_value 
        LIMIT 
          1
      ) END AS "floorSell" 
    FROM 
      x
    `;

    const result = await redb.oneOrNone(query, {
      collection,
      attributeKey,
      attributeValue,
    });

    if (result?.onSaleCount) {
      const floorSell = {
        id: result.floorSell.id,
        value: result.floorSell.value,
        currency: result.floorSell.currency ? toBuffer(result.floorSell.currency) : null,
        currencyValue: result.floorSell.currencyValue,
        maker: result.floorSell.maker ? toBuffer(result.floorSell.maker) : null,
        validFrom: result.floorSell.validFrom,
        validTo: result.floorSell.validTo,
        sourceIdInt: result.floorSell.sourceIdInt,
      };

      return { floorSell, onSaleCount: result.onSaleCount };
    }

    return { floorSell: null, onSaleCount: 0 };
  }

  public static async recalculateTokenFloorSell(contract: string, tokenId: string) {
    const tokenSetId = `token:${contract}:${tokenId}`;
    await orderUpdatesByIdJob.addToQueue([
      {
        context: `revalidate-sell-${tokenSetId}-${now()}`,
        tokenSetId,
        side: "sell",
        trigger: { kind: "revalidation" },
      },
    ]);
  }

  public static async recalculateTokenTopBid(contract: string, tokenId: string) {
    const tokenSetId = `token:${contract}:${tokenId}`;
    await orderUpdatesByIdJob.addToQueue([
      {
        context: `revalidate-buy-${tokenSetId}-${now()}`,
        tokenSetId,
        side: "buy",
        trigger: { kind: "revalidation" },
      },
    ]);
  }

  /**
   * Get top bid for the given tokens within a single contract
   * @param contract
   * @param tokenIds
   */
  public static async getTokensTopBid(contract: string, tokenIds: string[]) {
    const query = `
      SELECT "x"."contract", "x"."token_id", "y"."order_id", "y"."value", "y"."maker"
      FROM (
        SELECT contract, token_id
        FROM tokens
        WHERE contract = $/contract/
        AND token_id IN ($/tokenIds:csv/)
        ORDER BY contract, token_id ASC
      ) "x" LEFT JOIN LATERAL (
        SELECT
          "o"."id" as "order_id",
          "o"."value",
          "o"."maker"
        FROM "orders" "o"
        JOIN "token_sets_tokens" "tst" ON "o"."token_set_id" = "tst"."token_set_id"
        WHERE "tst"."contract" = "x"."contract"
        AND "tst"."token_id" = "x"."token_id"
        AND "o"."side" = 'buy'
        AND "o"."fillability_status" = 'fillable'
        AND "o"."approval_status" = 'approved'
        AND EXISTS(
          SELECT FROM "nft_balances" "nb"
            WHERE "nb"."contract" = "x"."contract"
            AND "nb"."token_id" = "x"."token_id"
            AND "nb"."amount" > 0
            AND "nb"."owner" != "o"."maker"
        )
        ORDER BY "o"."value" DESC
        LIMIT 1
      ) "y" ON TRUE
    `;

    const result = await redb.manyOrNone(query, {
      contract: toBuffer(contract),
      tokenIds,
    });

    return _.map(result, (r) => ({
      contract: r.contract ? fromBuffer(r.contract) : null,
      tokenId: r.token_id,
      orderId: r.order_id,
      value: r.value,
      maker: r.maker ? fromBuffer(r.maker) : null,
    }));
  }

  /**
   * Get top bids for tokens within multiple contracts, this is not the most efficient query, if the intention is to get
   * top bid for tokens which are all in the same contract, better to use getTokensTopBid
   * @param tokens
   */
  public static async getMultipleContractsTokensTopBid(
    tokens: { contract: string; tokenId: string }[]
  ) {
    let tokensFilter = "";
    const values = {};
    let i = 0;

    _.map(tokens, (token) => {
      tokensFilter += `($/contract${i}/, $/token${i}/),`;
      (values as any)[`contract${i}`] = toBuffer(token.contract);
      (values as any)[`token${i}`] = token.tokenId;
      ++i;
    });

    tokensFilter = _.trimEnd(tokensFilter, ",");

    const query = `
      SELECT "x"."contract", "x"."token_id", "y"."order_id", "y"."value", "y"."maker"
      FROM (
        SELECT contract, token_id
        FROM tokens
        WHERE (contract, token_id) IN (${tokensFilter})
        ORDER BY contract, token_id ASC
      ) "x" LEFT JOIN LATERAL (
        SELECT
          "o"."id" as "order_id",
          "o"."value",
          "o"."maker"
        FROM "orders" "o"
        JOIN "token_sets_tokens" "tst" ON "o"."token_set_id" = "tst"."token_set_id"
        WHERE "tst"."contract" = "x"."contract"
        AND "tst"."token_id" = "x"."token_id"
        AND "o"."side" = 'buy'
        AND "o"."fillability_status" = 'fillable'
        AND "o"."approval_status" = 'approved'
        AND EXISTS(
          SELECT FROM "nft_balances" "nb"
            WHERE "nb"."contract" = "x"."contract"
            AND "nb"."token_id" = "x"."token_id"
            AND "nb"."amount" > 0
            AND "nb"."owner" != "o"."maker"
        )
        ORDER BY "o"."value" DESC
        LIMIT 1
      ) "y" ON TRUE
    `;

    const result = await redb.manyOrNone(query, values);

    return _.map(result, (r) => ({
      contract: r.contract ? fromBuffer(r.contract) : null,
      tokenId: r.token_id,
      orderId: r.order_id,
      value: r.value,
      maker: r.maker ? fromBuffer(r.maker) : null,
    }));
  }

  /**
   * Get top bid for the given token set
   * @param tokenSetId
   */
  public static async getTokenSetTopBid(tokenSetId: string) {
    const query = `
      SELECT "x"."contract", "x"."token_id", "y"."order_id", "y"."value", "y"."maker"
      FROM (
        SELECT contract, token_id
        FROM token_sets_tokens
        WHERE token_set_id = $/tokenSetId/
        ORDER BY contract, token_id ASC
      ) "x" LEFT JOIN LATERAL (
        SELECT
          "o"."id" as "order_id",
          "o"."value",
          "o"."maker"
        FROM "orders" "o"
        JOIN "token_sets_tokens" "tst" ON "o"."token_set_id" = "tst"."token_set_id"
        WHERE "tst"."contract" = "x"."contract"
        AND "tst"."token_id" = "x"."token_id"
        AND "o"."side" = 'buy'
        AND "o"."fillability_status" = 'fillable'
        AND "o"."approval_status" = 'approved'
        AND EXISTS(
          SELECT FROM "nft_balances" "nb"
            WHERE "nb"."contract" = "x"."contract"
            AND "nb"."token_id" = "x"."token_id"
            AND "nb"."amount" > 0
            AND "nb"."owner" != "o"."maker"
        )
        ORDER BY "o"."value" DESC
        LIMIT 1
      ) "y" ON TRUE
    `;

    const result = await redb.manyOrNone(query, {
      tokenSetId,
    });

    return _.map(result, (r) => ({
      contract: fromBuffer(r.contract),
      tokenId: r.token_id,
      orderId: r.order_id,
      value: r.value,
      maker: fromBuffer(r.maker),
    }));
  }
}
