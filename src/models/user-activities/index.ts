/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";
import { redb, idb, pgp } from "@/common/db";
import { toBuffer } from "@/common/utils";

import {
  UserActivitiesEntity,
  UserActivitiesEntityInsertParams,
  UserActivitiesEntityParams,
} from "@/models/user-activities/user-activities-entity";

export class UserActivities {
  public static async addActivities(activities: UserActivitiesEntityInsertParams[]) {
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
        "address",
        "from_address",
        "to_address",
        "price",
        "amount",
        "block_hash",
        "event_timestamp",
        "metadata",
      ],
      { table: "user_activities" }
    );

    const data = activities.map((activity) => ({
      type: activity.type,
      hash: activity.hash,
      contract: toBuffer(activity.contract),
      collection_id: activity.collectionId,
      token_id: activity.tokenId,
      address: toBuffer(activity.address),
      from_address: toBuffer(activity.fromAddress),
      to_address: activity.toAddress ? toBuffer(activity.toAddress) : null,
      price: activity.price,
      amount: activity.amount,
      block_hash: activity.blockHash,
      event_timestamp: activity.eventTimestamp,
      metadata: activity.metadata,
    }));

    const query = pgp.helpers.insert(data, columns) + " ON CONFLICT DO NOTHING";

    await idb.none(query);
  }

  public static async getActivities(
    users: string[],
    createdBefore: null | string = null,
    types: string[] = [],
    limit = 20
  ) {
    let continuation = "";
    let typesFilter = "";

    if (!_.isNull(createdBefore)) {
      continuation = `AND event_timestamp < $/createdBefore/`;
    }

    if (!_.isEmpty(types)) {
      typesFilter = `AND type IN ('$/types:raw/')`;
    }

    const values = {
      limit,
      createdBefore,
      types: _.join(types, "','"),
    };

    let usersFilter = "";
    let i = 0;
    const addUsersToFilter = (user: string) => {
      ++i;
      (values as any)[`user${i}`] = toBuffer(user);
      usersFilter = `${usersFilter}$/user${i}/, `;
    };

    users.forEach(addUsersToFilter);

    usersFilter = `address IN (${usersFilter.substring(0, usersFilter.lastIndexOf(", "))})`;

    const activities: UserActivitiesEntityParams[] | null = await redb.manyOrNone(
      `SELECT *
             FROM user_activities
             LEFT JOIN LATERAL (
                SELECT name AS "token_name", image AS "token_image"
                FROM tokens
                WHERE user_activities.contract = tokens.contract
                AND user_activities.token_id = tokens.token_id
             ) t ON TRUE
             LEFT JOIN LATERAL (
                SELECT name AS "collection_name", metadata AS "collection_metadata"
                FROM collections
                WHERE user_activities.collection_id = collections.id
             ) c ON TRUE
             WHERE ${usersFilter}
             ${continuation}
             ${typesFilter}
             ORDER BY event_timestamp DESC NULLS LAST
             LIMIT $/limit/`,
      values
    );

    if (activities) {
      return _.map(activities, (activity) => new UserActivitiesEntity(activity));
    }

    return [];
  }

  public static async deleteByBlockHash(blockHash: string) {
    const query = `DELETE FROM user_activities
                   WHERE block_hash = $/blockHash/`;

    return await idb.none(query, { blockHash });
  }

  public static async updateMissingCollectionId(
    contract: string,
    tokenId: string,
    collectionId: string
  ) {
    const query = `
            UPDATE user_activities
            SET collection_id = $/collectionId/
            WHERE user_activities.contract = $/contract/
            AND user_activities.token_id = $/tokenId/
            AND user_activities.collection_id IS NULL
        `;

    return await idb.none(query, {
      contract: toBuffer(contract),
      tokenId,
      collectionId,
    });
  }
}
