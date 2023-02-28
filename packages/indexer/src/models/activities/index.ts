import _ from "lodash";
import { idb, pgp, redb } from "@/common/db";
import { splitContinuation, toBuffer } from "@/common/utils";
import {
  ActivitiesEntity,
  ActivitiesEntityInsertParams,
  ActivitiesEntityParams,
} from "@/models/activities/activities-entity";
import { Orders } from "@/utils/orders";

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
        "order_id",
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
      order_id: activity.orderId,
      from_address: toBuffer(activity.fromAddress),
      to_address: activity.toAddress ? toBuffer(activity.toAddress) : null,
      price: activity.price,
      amount: activity.amount,
      block_hash: activity.blockHash ? toBuffer(activity.blockHash) : null,
      event_timestamp: activity.eventTimestamp,
      metadata: activity.metadata,
    }));

    const query = pgp.helpers.insert(data, columns) + " ON CONFLICT DO NOTHING RETURNING id";

    await idb.manyOrNone(query);

    // results?.forEach(({ id }) => {
    //   websocketEventsTriggerQueue.addToQueue([
    //     {
    //       kind: websocketEventsTriggerQueue.EventKind.NewActivity,
    //       data: { activityId: id },
    //     },
    //   ]);
    // });
  }

  public static async deleteByBlockHash(blockHash: string) {
    const query = `DELETE FROM activities
                   WHERE block_hash = $/blockHash/`;

    return await idb.none(query, { blockHash: toBuffer(blockHash) });
  }

  public static async getActivities(
    continuation: null | string = null,
    limit = 20,
    byEventTimestamp = false,
    includeMetadata = true,
    sortDirection = "asc",
    includeCriteria = false
  ) {
    let eventTimestamp;
    let id;
    let metadataQuery = "";

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
             LEFT JOIN LATERAL (
                SELECT 
                    source_id_int AS "order_source_id_int",
                    side AS "order_side",
                    kind AS "order_kind",
                    (${orderMetadataBuildQuery}) AS "order_metadata",
                    (${orderCriteriaBuildQuery}) AS "order_criteria"
                FROM orders
                WHERE activities.order_id = orders.id
             ) o ON TRUE`;
    }

    let baseQuery = `
            SELECT *
            FROM activities
            ${metadataQuery}
            `;

    if (byEventTimestamp) {
      if (!_.isNull(continuation) && continuation !== "null") {
        const sign = sortDirection == "desc" ? "<" : ">";
        [eventTimestamp, id] = splitContinuation(continuation, /^(\d+)_(\d+)$/);
        baseQuery += ` WHERE (event_timestamp, id) ${sign} ($/eventTimestamp/, $/id/)`;
      }

      baseQuery += ` ORDER BY event_timestamp ${sortDirection}, id ${sortDirection}`;
    } else {
      if (!_.isNull(continuation) && continuation !== "null") {
        id = continuation;
        const sign = sortDirection == "desc" ? "<" : ">";
        baseQuery += ` WHERE id ${sign} $/id/`;
      }

      baseQuery += ` ORDER BY id ${sortDirection}`;
    }

    baseQuery += ` LIMIT $/limit/`;

    const activities: ActivitiesEntityParams[] | null = await idb.manyOrNone(baseQuery, {
      limit,
      id,
      eventTimestamp,
    });

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
    collectionId = "",
    community = "",
    collectionsSetId = "",
    createdBefore: null | string = null,
    types: string[] = [],
    limit = 50,
    sortBy = "eventTimestamp",
    includeMetadata = true,
    includeCriteria = false
  ) {
    const sortByColumn = sortBy == "eventTimestamp" ? "event_timestamp" : "created_at";
    let continuation = "";
    let typesFilter = "";
    let metadataQuery = "";
    let collectionFilter = "";
    let nullsLast = "";

    if (!_.isNull(createdBefore)) {
      continuation = `AND ${sortByColumn} < $/createdBefore/`;
    }

    if (!_.isEmpty(types)) {
      typesFilter = `AND type IN ('$/types:raw/')`;
    }

    if (collectionsSetId) {
      nullsLast = "NULLS LAST";
      collectionFilter = `WHERE collection_id IN (select collection_id
            FROM collections_sets_collections
            WHERE collections_set_id = $/collectionsSetId/
         )`;
    } else if (community) {
      collectionFilter =
        "WHERE collection_id IN (SELECT id FROM collections WHERE community = $/community/)";
    } else if (collectionId) {
      nullsLast = "NULLS LAST";
      collectionFilter = "WHERE collection_id = $/collectionId/";
    }

    if (!collectionFilter) {
      return [];
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
             LEFT JOIN LATERAL (
                SELECT 
                    source_id_int AS "order_source_id_int",
                    side AS "order_side",
                    kind AS "order_kind",
                    (${orderMetadataBuildQuery}) AS "order_metadata",
                    (${orderCriteriaBuildQuery}) AS "order_criteria"
                FROM orders
                WHERE activities.order_id = orders.id
             ) o ON TRUE`;
    }

    const activities: ActivitiesEntityParams[] | null = await redb.manyOrNone(
      `SELECT *
             FROM activities
             ${metadataQuery}
             ${collectionFilter}
             ${continuation}
             ${typesFilter}
             ORDER BY activities.${sortByColumn} DESC ${nullsLast}
             LIMIT $/limit/`,
      {
        collectionId,
        limit,
        community,
        collectionsSetId,
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
    sortBy = "eventTimestamp",
    includeMetadata = true,
    includeCriteria = false
  ) {
    const sortByColumn = sortBy == "eventTimestamp" ? "event_timestamp" : "created_at";
    let continuation = "";
    let typesFilter = "";
    let metadataQuery = "";

    if (!_.isNull(createdBefore)) {
      continuation = `AND ${sortByColumn} < $/createdBefore/`;
    }

    if (!_.isEmpty(types)) {
      typesFilter = `AND type IN ('$/types:raw/')`;
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
             LEFT JOIN LATERAL (
                SELECT 
                    source_id_int AS "order_source_id_int",
                    side AS "order_side",
                    kind AS "order_kind",
                    (${orderMetadataBuildQuery}) AS "order_metadata",
                    (${orderCriteriaBuildQuery}) AS "order_criteria"
                FROM orders
                WHERE activities.order_id = orders.id
             ) o ON TRUE`;
    }

    const activities: ActivitiesEntityParams[] | null = await redb.manyOrNone(
      `SELECT *
             FROM activities
             ${metadataQuery}
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
