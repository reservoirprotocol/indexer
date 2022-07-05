/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";

import { idb, redb } from "@/common/db";
import { toBuffer } from "@/common/utils";
import * as orderUpdatesById from "@/jobs/order-updates/by-id-queue";
import {
  TokensEntity,
  TokensEntityParams,
  TokensEntityUpdateParams,
} from "@/models/tokens/tokens-entity";

export type TokenAttributes = {
  attributeId: number;
  key: string;
  value: string;
  attributeKeyId: number;
  collectionId: string;
  floorSellValue: number | null;
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

  public static async getTokenAttributes(contract: string, tokenId: string) {
    const query = `SELECT attribute_id AS "attributeId", token_attributes.key, token_attributes.value, attribute_key_id AS "attributeKeyId",
                          token_attributes.collection_id AS "collectionId", floor_sell_value AS "floorSellValue"
                   FROM token_attributes
                   JOIN attributes ON token_attributes.attribute_id = attributes.id
                   WHERE contract = $/contract/
                   AND token_id = $/tokenId/`;

    return (await redb.manyOrNone(query, {
      contract: toBuffer(contract),
      tokenId,
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
    const query = `SELECT attribute_id AS "attributeId", count(*) AS count
                   FROM token_attributes
                   WHERE collection_id = $/collection/
                   AND key = $/key/
                   AND value = $/value/
                   GROUP BY key, value, attribute_id`;

    return await redb.oneOrNone(query, {
      collection,
      key,
      value,
    });
  }

  public static async countTokensInCollection(collectionId: string) {
    const query = `SELECT count(*) AS count
                   FROM tokens
                   WHERE collection_id = $/collectionId/`;

    return await idb
      .oneOrNone(query, {
        collectionId,
      })
      .then((result) => (result ? result.count : 0));
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
    const query = `SELECT COUNT(*) AS "onSaleCount", MIN(floor_sell_value) AS "floorSellValue"
                   FROM token_attributes
                   JOIN tokens ON token_attributes.contract = tokens.contract AND token_attributes.token_id = tokens.token_id
                   WHERE token_attributes.collection_id = $/collection/
                   AND key = $/attributeKey/
                   AND value = $/attributeValue/
                   AND floor_sell_value IS NOT NULL`;

    const result = await redb.oneOrNone(query, {
      collection,
      attributeKey,
      attributeValue,
    });

    if (result) {
      return { floorSellValue: result.floorSellValue, onSaleCount: result.onSaleCount };
    }

    return { floorSellValue: null, onSaleCount: 0 };
  }

  public static async recalculateTokenFloorSell(contract: string, tokenId: string) {
    const tokenSetId = `token:${contract}:${tokenId}`;
    await orderUpdatesById.addToQueue([
      {
        context: `revalidate-sell-${tokenSetId}-${Math.floor(Date.now() / 1000)}`,
        tokenSetId,
        side: "sell",
        trigger: { kind: "revalidation" },
      },
    ]);
  }

  public static async recalculateTokenTopBuy(contract: string, tokenId: string) {
    const tokenSetId = `token:${contract}:${tokenId}`;
    await orderUpdatesById.addToQueue([
      {
        context: `revalidate-buy-${tokenSetId}-${Math.floor(Date.now() / 1000)}`,
        tokenSetId,
        side: "buy",
        trigger: { kind: "revalidation" },
      },
    ]);
  }
}
