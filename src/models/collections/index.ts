/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";

import { idb, redb } from "@/common/db";
import { logger } from "@/common/logger";
import { toBuffer, now } from "@/common/utils";
import * as orderUpdatesById from "@/jobs/order-updates/by-id-queue";
import {
  CollectionsEntity,
  CollectionsEntityParams,
  CollectionsEntityUpdateParams,
} from "@/models/collections/collections-entity";
import { Tokens } from "@/models/tokens";
import MetadataApi from "@/utils/metadata-api";
import * as royalties from "@/utils/royalties";

export class Collections {
  public static async getById(collectionId: string, readReplica = false) {
    const dbInstance = readReplica ? redb : idb;
    const collection: CollectionsEntityParams | null = await dbInstance.oneOrNone(
      `
        SELECT
          *
        FROM collections
        WHERE id = $/collectionId/
      `,
      { collectionId }
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
      `
        SELECT
          *
        FROM collections
        WHERE contract = $/contract/
          AND token_id_range @> $/tokenId/::NUMERIC(78, 0)
      `,
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
      `
        SELECT
          *
        FROM collections
        WHERE token_set_id = $/tokenSetId/
      `,
      { tokenSetId }
    );

    if (collection) {
      return new CollectionsEntity(collection);
    }

    return null;
  }

  public static async updateCollectionCache(contract: string, tokenId: string, community = "") {
    const collection = await MetadataApi.getCollectionMetadata(contract, tokenId, community);
    logger.info(
      "debug",
      `getCollectionMetadata. contract=${contract}, tokenId=${tokenId}, community=${community}, collection=${JSON.stringify(
        collection
      )}`
    );
    const tokenCount = await Tokens.countTokensInCollection(collection.id);

    const query = `
      UPDATE collections SET
        metadata = $/metadata:json/,
        name = $/name/,
        slug = $/slug/,
        token_count = $/tokenCount/,
        updated_at = now()
      WHERE id = $/id/
    `;

    const values = {
      id: collection.id,
      metadata: collection.metadata || {},
      name: collection.name,
      slug: collection.slug,
      tokenCount,
    };

    await idb.none(query, values);

    // Refresh all royalty specs and the default royalties
    await royalties.refreshAllRoyaltySpecs(
      collection.id,
      (collection.royalties ?? []) as royalties.Royalty[],
      (collection.openseaRoyalties ?? []) as royalties.Royalty[]
    );
    await royalties.refreshDefaulRoyalties(collection.id);
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

    const query = `
      UPDATE collections
        SET ${updateString}
      WHERE id = $/collectionId/
    `;

    return await idb.none(query, replacementValues);
  }

  public static async getCollectionsMintedBetween(from: number, to: number, limit = 2000) {
    const query = `
      SELECT
        *
      FROM collections
      WHERE minted_timestamp > ${from}
        AND minted_timestamp < ${to}
      ORDER BY minted_timestamp ASC
      LIMIT ${limit}
    `;

    const collections = await redb.manyOrNone(query);
    if (!_.isEmpty(collections)) {
      return _.map(collections, (collection) => new CollectionsEntity(collection));
    }

    return [];
  }

  public static async getTopCollectionsByVolume(limit = 500) {
    const query = `
      SELECT
        *
      FROM collections
      ORDER BY day1_volume DESC
      LIMIT ${limit}
    `;

    const collections = await redb.manyOrNone(query);
    if (!_.isEmpty(collections)) {
      return _.map(collections, (collection) => new CollectionsEntity(collection));
    }

    return [];
  }

  public static async recalculateCollectionFloorSell(collection: string) {
    const query = `
      UPDATE collections SET
        floor_sell_id = x.floor_sell_id,
        floor_sell_value = x.floor_sell_value,
        floor_sell_maker = x.floor_sell_maker,
        floor_sell_source_id_int = x.source_id_int,
        floor_sell_valid_between = x.valid_between,
        updated_at = now()
      FROM (
        SELECT
          tokens.floor_sell_id,
          tokens.floor_sell_value,
          tokens.floor_sell_maker,
          orders.source_id_int,
          orders.valid_between
        FROM tokens
        JOIN orders
        ON tokens.floor_sell_id = orders.id
        WHERE tokens.collection_id = $/collection/
        ORDER BY tokens.floor_sell_value
        LIMIT 1
      ) x
      WHERE collections.id = $/collection/
      AND (
        collections.floor_sell_id IS DISTINCT FROM x.floor_sell_id
        OR collections.floor_sell_value IS DISTINCT FROM x.floor_sell_value
      )
    `;

    await idb.none(query, {
      collection,
    });
  }

  public static async recalculateContractFloorSell(contract: string) {
    const result = await redb.manyOrNone(
      `
        SELECT
          tokens.token_id
        FROM tokens
        WHERE tokens.contract = $/contract/
          AND tokens.floor_sell_id IS NOT NULL
        LIMIT 10000
      `,
      { contract: toBuffer(contract) }
    );

    if (result) {
      const currentTime = now();
      await orderUpdatesById.addToQueue(
        result.map(({ token_id }) => {
          const tokenSetId = `token:${contract}:${token_id}`;
          return {
            context: `revalidate-sell-${tokenSetId}-${currentTime}`,
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
      { contract: toBuffer(contract) }
    );

    if (result) {
      const currentTime = now();
      await orderUpdatesById.addToQueue(
        result.map(({ token_id }) => {
          const tokenSetId = `token:${contract}:${token_id}`;
          return {
            context: `revalidate-buy-${tokenSetId}-${currentTime}`,
            tokenSetId,
            side: "buy",
            trigger: { kind: "revalidation" },
          };
        })
      );
    }
  }

  public static async revalidateCollectionTopBuy(collection: string) {
    const tokenSetsResult = await redb.manyOrNone(
      `
        SELECT token_sets.id
        FROM token_sets
        WHERE token_sets.collection_id = $/collection/
          AND token_sets.top_buy_id IS NOT NULL
      `,
      { collection }
    );

    if (tokenSetsResult.length) {
      const currentTime = now();
      await orderUpdatesById.addToQueue(
        tokenSetsResult.map((tokenSet: { id: any }) => ({
          context: `revalidate-buy-${tokenSet.id}-${currentTime}`,
          tokenSetId: tokenSet.id,
          side: "buy",
          trigger: { kind: "revalidation" },
        }))
      );
    }
  }
}
