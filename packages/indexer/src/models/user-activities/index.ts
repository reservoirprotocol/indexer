/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";
import { redb, idb, pgp } from "@/common/db";
import { toBuffer } from "@/common/utils";

import {
  UserActivitiesEntity,
  UserActivitiesEntityInsertParams,
  UserActivitiesEntityParams,
} from "@/models/user-activities/user-activities-entity";
import { Orders } from "@/utils/orders";

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
        "order_id",
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
      order_id: activity.orderId,
      address: toBuffer(activity.address),
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

  public static async getActivities(
    users: string[],
    collections: string[] = [],
    community = "",
    createdBefore: null | string = null,
    types: string[] = [],
    limit = 20,
    sortBy = "eventTimestamp",
    includeMetadata = true,
    includeCriteria = false,
    contracts: string[] = []
  ) {
    const sortByColumn = sortBy == "eventTimestamp" ? "event_timestamp" : "created_at";
    let continuation = "";
    let typesFilter = "";
    let metadataQuery = "";
    let collectionFilter = "";
    let communityFilter = "";
    let contractsFilter = "";

    if (!_.isNull(createdBefore)) {
      continuation = `AND ${sortByColumn} < $/createdBefore/`;
    }

    if (!_.isEmpty(types)) {
      typesFilter = `AND type IN ('$/types:raw/')`;
    }

    if (!_.isEmpty(collections)) {
      if (Array.isArray(collections)) {
        collectionFilter = `AND collection_id IN ($/collections:csv/)`;
      } else {
        collectionFilter = `AND collection_id = $/collections/`;
      }
    }

    if (!_.isEmpty(contracts)) {
      contractsFilter = `AND contract IN ($/contracts:csv/)`;
    }

    if (community) {
      communityFilter = "AND collections.community = $/community/";
    }

    if (includeMetadata) {
      let orderCriteriaBuildQuery = "json_build_object()";
      let orderMetadataBuildQuery = "json_build_object()";

      if (includeCriteria) {
        orderCriteriaBuildQuery = Orders.buildCriteriaQuery(
          "orders",
          "token_set_id",
          includeMetadata
        );
      } else {
        orderMetadataBuildQuery = `
          CASE
            WHEN orders.token_set_id LIKE 'token:%' THEN
              (SELECT
                json_build_object(
                  'kind', 'token',
                  'data', json_build_object(
                    'collectionName', collections.name,
                    'tokenName', tokens.name,
                    'image', tokens.image
                  )
                )
              FROM tokens
              JOIN collections
                ON tokens.collection_id = collections.id
              WHERE tokens.contract = decode(substring(split_part(orders.token_set_id, ':', 2) from 3), 'hex')
                AND tokens.token_id = (split_part(orders.token_set_id, ':', 3)::NUMERIC(78, 0)))

            WHEN orders.token_set_id LIKE 'contract:%' THEN
              (SELECT
                json_build_object(
                  'kind', 'collection',
                  'data', json_build_object(
                    'collectionName', collections.name,
                    'image', (collections.metadata ->> 'imageUrl')::TEXT
                  )
                )
              FROM collections
              WHERE collections.id = substring(orders.token_set_id from 10))

            WHEN orders.token_set_id LIKE 'range:%' THEN
              (SELECT
                json_build_object(
                  'kind', 'collection',
                  'data', json_build_object(
                    'collectionName', collections.name,
                    'image', (collections.metadata ->> 'imageUrl')::TEXT
                  )
                )
              FROM collections
              WHERE collections.id = substring(orders.token_set_id from 7))

            WHEN orders.token_set_id LIKE 'list:%' THEN
              (SELECT
                CASE
                  WHEN token_sets.attribute_id IS NULL THEN
                    (SELECT
                      json_build_object(
                        'kind', 'collection',
                        'data', json_build_object(
                          'collectionName', collections.name,
                          'image', (collections.metadata ->> 'imageUrl')::TEXT
                        )
                      )
                    FROM collections
                    WHERE token_sets.collection_id = collections.id)
                  ELSE
                    (SELECT
                      json_build_object(
                        'kind', 'attribute',
                        'data', json_build_object(
                          'collectionName', collections.name,
                          'attributes', ARRAY[json_build_object('key', attribute_keys.key, 'value', attributes.value)],
                          'image', (collections.metadata ->> 'imageUrl')::TEXT
                        )
                      )
                    FROM attributes
                    JOIN attribute_keys
                    ON attributes.attribute_key_id = attribute_keys.id
                    JOIN collections
                    ON attribute_keys.collection_id = collections.id
                    WHERE token_sets.attribute_id = attributes.id)
                END  
              FROM token_sets
              WHERE token_sets.id = orders.token_set_id AND token_sets.schema_hash = orders.token_set_schema_hash)
            ELSE NULL
          END
      `;
      }

      metadataQuery = `
             LEFT JOIN LATERAL (
                SELECT name AS "token_name", image AS "token_image", 
                last_buy_value as "token_last_buy_value", last_sell_value as "token_last_sell_value",
                last_buy_timestamp as "token_last_buy_timestamp", last_sell_timestamp as "token_last_sell_timestamp",
                rarity_score as "token_rarity_score", rarity_rank as "token_rarity_rank", media as "token_media"
                FROM tokens
                WHERE user_activities.contract = tokens.contract
                AND user_activities.token_id = tokens.token_id
             ) t ON TRUE
             ${community ? "" : "LEFT"} JOIN LATERAL (
                SELECT name AS "collection_name", metadata AS "collection_metadata"
                FROM collections
                WHERE user_activities.collection_id = collections.id
                ${communityFilter}
             ) c ON TRUE
             LEFT JOIN LATERAL (
                SELECT 
                    source_id_int AS "order_source_id_int",
                    side AS "order_side",
                    kind AS "order_kind",
                    (${orderMetadataBuildQuery}) AS "order_metadata",
                    (${orderCriteriaBuildQuery}) AS "order_criteria"
                FROM orders
                WHERE user_activities.order_id = orders.id
             ) o ON TRUE
             `;
    }

    const values = {
      limit,
      createdBefore: sortBy == "eventTimestamp" ? Number(createdBefore) : createdBefore,
      types: _.join(types, "','"),
      collections,
      community,
      contracts: contracts.map((contract: string) => toBuffer(contract)),
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
             ${metadataQuery}   
             WHERE ${usersFilter}
             ${contractsFilter}
             ${continuation}
             ${typesFilter}
             ${collectionFilter}
             ORDER BY ${sortByColumn} DESC NULLS LAST
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

    return await idb.none(query, { blockHash: toBuffer(blockHash) });
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
