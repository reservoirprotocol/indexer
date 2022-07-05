/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";

import { idb, redb } from "@/common/db";
import { toBuffer } from "@/common/utils";
import * as orderUpdatesById from "@/jobs/order-updates/by-id-queue";
import {
  CollectionsEntity,
  CollectionsEntityParams,
  CollectionsEntityUpdateParams,
} from "@/models/collections/collections-entity";
import { Tokens } from "@/models/tokens";
import MetadataApi from "@/utils/metadata-api";

export class Collections {
  public static async getById(collectionId: string, readReplica = false) {
    const dbInstance = readReplica ? redb : idb;
    const collection: CollectionsEntityParams | null = await dbInstance.oneOrNone(
      `SELECT *
              FROM collections
              WHERE id = $/collectionId/`,
      {
        collectionId,
      }
    );

    if (collection) {
      return new CollectionsEntity(collection);
    }

    return null;
  }

  public static async getByContractAndTokenId(
    contract: string,
    tokenId: number,
    readReplica = false
  ) {
    const dbInstance = readReplica ? redb : idb;
    const collection: CollectionsEntityParams | null = await dbInstance.oneOrNone(
      `SELECT *
              FROM collections
              WHERE contract = $/contract/
              AND token_id_range @> $/tokenId/::NUMERIC(78, 0)`,
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

  public static async getByTokenSetId(tokenSetId: string) {
    const collection: CollectionsEntityParams | null = await redb.oneOrNone(
      `SELECT *
              FROM collections
              WHERE token_set_id = $/tokenSetId/`,
      {
        tokenSetId,
      }
    );

    if (collection) {
      return new CollectionsEntity(collection);
    }

    return null;
  }

  public static async updateCollectionCache(contract: string, tokenId: string) {
    const collection = await MetadataApi.getCollectionMetadata(contract, tokenId);
    const tokenCount = await Tokens.countTokensInCollection(collection.id);

    const query = `UPDATE collections
                   SET metadata = $/metadata:json/, name = $/name/, royalties = $/royalties:json/,
                       slug = $/slug/, token_count = $/tokenCount/, updated_at = now()
                   WHERE id = $/id/`;

    const values = {
      id: collection.id,
      metadata: collection.metadata,
      name: collection.name,
      royalties: collection.royalties,
      slug: collection.slug,
      tokenCount,
    };

    await idb.none(query, values);
  }

  public static async update(collectionId: string, fields: CollectionsEntityUpdateParams) {
    let updateString = "";
    const replacementValues = {
      collectionId,
    };

    _.forEach(fields, (value, fieldName) => {
      updateString += `${_.snakeCase(fieldName)} = $/${fieldName}/,`;
      (replacementValues as any)[fieldName] = value;
    });

    updateString = _.trimEnd(updateString, ",");

    const query = `UPDATE collections
                   SET ${updateString}
                   WHERE id = $/collectionId/`;

    return await idb.none(query, replacementValues);
  }

  public static async getCollectionsMintedBetween(from: number, to: number, limit = 2000) {
    const query = `SELECT *
                   FROM collections
                   WHERE minted_timestamp > ${from}
                   AND minted_timestamp < ${to}
                   ORDER BY minted_timestamp ASC
                   LIMIT ${limit}`;

    const collections = await redb.manyOrNone(query);

    if (!_.isEmpty(collections)) {
      return _.map(collections, (collection) => new CollectionsEntity(collection));
    }

    return [];
  }

  public static async getTopCollectionsByVolume(limit = 500) {
    const query = `SELECT *
                   FROM collections
                   ORDER BY day1_volume DESC
                   LIMIT ${limit}`;

    const collections = await redb.manyOrNone(query);

    if (!_.isEmpty(collections)) {
      return _.map(collections, (collection) => new CollectionsEntity(collection));
    }

    return [];
  }

  public static async recalculateContractFloorSell(contract: string) {
    const result = await redb.manyOrNone(
      `
        SELECT
          tokens.token_id
        FROM tokens
        WHERE tokens.contract = $/contract/
        LIMIT 10000
      `,
      {
        contract: toBuffer(contract),
      }
    );

    if (result) {
      await orderUpdatesById.addToQueue(
        result.map(({ token_id }) => {
          const tokenSetId = `token:${contract}:${token_id}`;
          return {
            context: `revalidate-sell-${tokenSetId}-${Math.floor(Date.now() / 1000)}`,
            tokenSetId,
            side: "sell",
            trigger: { kind: "revalidation" },
          };
        })
      );
    }
  }

  public static async recalculateContractTopBuy(contract: string) {
    const result = await redb.manyOrNone(
      `
        SELECT
          tokens.token_id
        FROM tokens
        WHERE tokens.contract = $/contract/
        LIMIT 10000
      `,
      {
        contract: toBuffer(contract),
      }
    );

    if (result) {
      await orderUpdatesById.addToQueue(
        result.map(({ token_id }) => {
          const tokenSetId = `token:${contract}:${token_id}`;
          return {
            context: `revalidate-buy-${tokenSetId}-${Math.floor(Date.now() / 1000)}`,
            tokenSetId,
            side: "buy",
            trigger: { kind: "revalidation" },
          };
        })
      );
    }
  }
}
