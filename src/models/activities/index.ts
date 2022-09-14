import _ from "lodash";
import { idb, pgp, redb } from "@/common/db";
import { toBuffer } from "@/common/utils";
import {
  ActivitiesEntity,
  ActivitiesEntityInsertParams,
  ActivitiesEntityParams,
} from "@/models/activities/activities-entity";

export class Activities {
  public static async addActivities(activities: ActivitiesEntityInsertParams[]) {
    if (!activities.length) {
      return;
    }

    const columns = new pgp.helpers.ColumnSet(
      [
        "hash",
        "type",
        "contract",
        "collection_id",
        "token_id",
        "from_address",
        "to_address",
        "price",
        "amount",
        "block_hash",
        "event_timestamp",
        "metadata",
      ],
      { table: "activities" }
    );

    const data = activities.map((activity) => ({
      type: activity.type,
      hash: activity.hash,
      contract: toBuffer(activity.contract),
      collection_id: activity.collectionId,
      token_id: activity.tokenId,
      from_address: toBuffer(activity.fromAddress),
      to_address: activity.toAddress ? toBuffer(activity.toAddress) : null,
      price: activity.price,
      amount: activity.amount,
      block_hash: activity.blockHash ? toBuffer(activity.blockHash) : null,
      event_timestamp: activity.eventTimestamp,
      metadata: activity.metadata,
    }));

    const query = pgp.helpers.insert(data, columns) + " ON CONFLICT DO NOTHING";

    await idb.none(query);
  }

  public static async deleteByBlockHash(blockHash: string) {
    const query = `DELETE FROM activities
                   WHERE block_hash = $/blockHash/`;

    return await idb.none(query, { blockHash });
  }

  public static async getActivities(continuation: null | number = null, limit = 20) {
    let continuationFilter = "";

    if (!_.isNull(continuation)) {
      continuationFilter = `WHERE id > $/continuation/`;
    }

    const activities: ActivitiesEntityParams[] | null = await redb.manyOrNone(
      `SELECT *
             FROM activities
             ${continuationFilter}
             ORDER BY id ASC
             LIMIT $/limit/`,
      {
        limit,
        continuation,
      }
    );

    if (activities) {
      return _.map(activities, (activity) => new ActivitiesEntity(activity));
    }

    return [];
  }

  public static async updateMissingCollectionId(
    contract: string,
    tokenId: string,
    collectionId: string
  ) {
    const query = `
            UPDATE activities
            SET collection_id = $/collectionId/
            WHERE activities.contract = $/contract/
            AND activities.token_id = $/tokenId/
            AND activities.collection_id IS NULL
        `;

    return await idb.none(query, {
      contract: toBuffer(contract),
      tokenId,
      collectionId,
    });
  }

  public static async getCollectionActivities(
    collectionId: string,
    createdBefore: null | string = null,
    types: string[] = [],
    limit = 20,
    sortBy = "eventTimestamp"
  ) {
    const sortByColumn = sortBy == "eventTimestamp" ? "event_timestamp" : "created_at";
    let continuation = "";
    let typesFilter = "";

    if (!_.isNull(createdBefore)) {
      continuation = `AND ${sortByColumn} < $/createdBefore/`;
    }

    if (!_.isEmpty(types)) {
      typesFilter = `AND type IN ('$/types:raw/')`;
    }

    const activities: ActivitiesEntityParams[] | null = await redb.manyOrNone(
      `SELECT *
             FROM activities
             LEFT JOIN LATERAL (
                SELECT name AS "token_name", image AS "token_image"
                FROM tokens
                WHERE activities.contract = tokens.contract
                AND activities.token_id = tokens.token_id
             ) t ON TRUE
             LEFT JOIN LATERAL (
                SELECT name AS "collection_name", metadata AS "collection_metadata"
                FROM collections
                WHERE activities.collection_id = collections.id
             ) c ON TRUE
             WHERE collection_id = $/collectionId/
             ${continuation}
             ${typesFilter}
             ORDER BY ${sortByColumn} DESC NULLS LAST
             LIMIT $/limit/`,
      {
        collectionId,
        limit,
        createdBefore: sortBy == "eventTimestamp" ? Number(createdBefore) : createdBefore,
        types: _.join(types, "','"),
      }
    );

    if (activities) {
      return _.map(activities, (activity) => new ActivitiesEntity(activity));
    }

    return [];
  }

  public static async getTokenActivities(
    contract: string,
    tokenId: string,
    createdBefore: null | string = null,
    types: string[] = [],
    limit = 20,
    sortBy = "eventTimestamp"
  ) {
    const sortByColumn = sortBy == "eventTimestamp" ? "event_timestamp" : "created_at";
    let continuation = "";
    let typesFilter = "";

    if (!_.isNull(createdBefore)) {
      continuation = `AND ${sortByColumn} < $/createdBefore/`;
    }

    if (!_.isEmpty(types)) {
      typesFilter = `AND type IN ('$/types:raw/')`;
    }

    const activities: ActivitiesEntityParams[] | null = await redb.manyOrNone(
      `SELECT *
             FROM activities
             LEFT JOIN LATERAL (
                SELECT name AS "token_name", image AS "token_image"
                FROM tokens
                WHERE activities.contract = tokens.contract
                AND activities.token_id = tokens.token_id
             ) t ON TRUE
             LEFT JOIN LATERAL (
                SELECT name AS "collection_name", metadata AS "collection_metadata"
                FROM collections
                WHERE activities.collection_id = collections.id
             ) c ON TRUE
             WHERE contract = $/contract/
             AND token_id = $/tokenId/
             ${continuation}
             ${typesFilter}
             ORDER BY ${sortByColumn} DESC NULLS LAST
             LIMIT $/limit/`,
      {
        contract: toBuffer(contract),
        tokenId,
        limit,
        createdBefore: sortBy == "eventTimestamp" ? Number(createdBefore) : createdBefore,
        types: _.join(types, "','"),
      }
    );

    if (activities) {
      return _.map(activities, (activity) => new ActivitiesEntity(activity));
    }

    return [];
  }
}
