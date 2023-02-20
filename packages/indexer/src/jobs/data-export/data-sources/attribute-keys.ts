import { ridb } from "@/common/db";
import { BaseDataSource } from "@/jobs/data-export/data-sources/index";
import _ from "lodash";

export class AttributeKeysDataSource extends BaseDataSource {
  public async getSequenceData(cursor: CursorInfo | null, limit: number) {
    const updatesCursor = cursor?.updates;
    const removalsCursor = cursor?.removals;

    let updatesContinuationFilter = "";

    if (updatesCursor) {
      updatesContinuationFilter = `WHERE (updated_at, id) > (to_timestamp($/updatedAt/), $/id/)`;
    }

    const updatedQuery = `
        SELECT
          id,
          collection_id,
          key,
          kind,
          rank,
          created_at,
          extract(epoch from updated_at) updated_ts
        FROM attribute_keys
       ${updatesContinuationFilter}
        ORDER BY updated_at, id
        LIMIT $/limit/;  
      `;

    const updatedResult = await ridb.manyOrNone(updatedQuery, {
      id: updatesCursor?.id,
      updatedAt: updatesCursor?.updatedAt,
      limit,
    });

    let removalsContinuationFilter = "";

    if (removalsCursor) {
      removalsContinuationFilter = `WHERE (deleted_at, id) > (to_timestamp($/deletedAt/), $/id/)`;
    }

    const removedQuery = `
        SELECT
          id,
          collection_id,
          key,
          kind,
          rank,
          created_at,
          extract(epoch from deleted_at) deleted_ts
        FROM removed_attribute_keys
        ${removalsContinuationFilter}
        ORDER BY deleted_at, id
        LIMIT $/limit/;  
      `;

    const removedResult = await ridb.manyOrNone(removedQuery, {
      id: removalsCursor?.id,
      deletedAt: removalsCursor?.deletedAt,
      limit,
    });

    if (updatedResult.length || removedResult.length) {
      const updatedAttributeKeys = updatedResult.map((r) => ({
        id: r.id,
        collection_id: r.collection_id,
        key: r.key,
        kind: r.kind,
        rank: r.rank,
        created_at: new Date(r.created_at).toISOString(),
        updated_at: new Date(r.updated_ts * 1000).toISOString(),
        is_active: true,
      }));

      let nextUpdatesCursor = _.clone(updatesCursor);

      if (updatedResult.length) {
        const lastUpdatedResult = updatedResult[updatedResult.length - 1];

        nextUpdatesCursor = {
          id: lastUpdatedResult.id,
          updatedAt: lastUpdatedResult.updated_ts,
        };
      }

      const removedAttributeKeys = removedResult.map((r) => ({
        id: r.id,
        collection_id: r.collection_id,
        key: r.key,
        kind: r.kind,
        rank: r.rank,
        created_at: new Date(r.created_at).toISOString(),
        updated_at: new Date(r.deleted_ts * 1000).toISOString(),
        is_active: false,
      }));

      let nextRemovalsCursor = _.clone(removalsCursor);

      if (removedResult.length) {
        const lastRemovedResult = removedResult[removedResult.length - 1];

        nextRemovalsCursor = {
          id: lastRemovedResult.id,
          deletedAt: lastRemovedResult.deleted_ts,
        };
      }

      return {
        data: updatedAttributeKeys.concat(removedAttributeKeys),
        nextCursor: {
          updates: nextUpdatesCursor,
          removals: nextRemovalsCursor,
        },
      };
    }

    return { data: [], nextCursor: null };
  }
}

export class AttributeKeysDataSourceV2 extends BaseDataSource {
  public async getSequenceData(cursor: CursorInfo | null, limit: number) {
    const updatesCursor = cursor?.updates;
    const removalsCursor = cursor?.removals;

    let updatesContinuationFilter = "";

    if (updatesCursor) {
      updatesContinuationFilter = `AND (updated_at, id) > (to_timestamp($/updatedAt/), $/id/)`;
    }

    const updatedQuery = `
        SELECT
          id,
          collection_id,
          key,
          kind,
          rank,
          created_at,
          extract(epoch from updated_at) updated_ts
        FROM attribute_keys
        WHERE updated_at < NOW() - INTERVAL '1 minutes'
        ${updatesContinuationFilter}
        ORDER BY updated_at, id
        LIMIT $/limit/;  
      `;

    const updatedResult = await ridb.manyOrNone(updatedQuery, {
      id: updatesCursor?.id,
      updatedAt: updatesCursor?.updatedAt,
      limit,
    });

    let removalsContinuationFilter = "";

    if (removalsCursor) {
      removalsContinuationFilter = `AND (deleted_at, id) > (to_timestamp($/deletedAt/), $/id/)`;
    }

    const removedQuery = `
        SELECT
          id,
          collection_id,
          key,
          kind,
          rank,
          created_at,
          extract(epoch from deleted_at) deleted_ts
        FROM removed_attribute_keys
        WHERE deleted_at < NOW() - INTERVAL '1 minutes'
        ${removalsContinuationFilter}
        ORDER BY deleted_at, id
        LIMIT $/limit/;  
      `;

    const removedResult = await ridb.manyOrNone(removedQuery, {
      id: removalsCursor?.id,
      deletedAt: removalsCursor?.deletedAt,
      limit,
    });

    if (updatedResult.length || removedResult.length) {
      const updatedAttributeKeys = updatedResult.map((r) => ({
        id: r.id,
        collection_id: r.collection_id,
        key: r.key,
        kind: r.kind,
        rank: r.rank,
        created_at: new Date(r.created_at).toISOString(),
        updated_at: new Date(r.updated_ts * 1000).toISOString(),
        is_active: true,
      }));

      let nextUpdatesCursor = _.clone(updatesCursor);

      if (updatedResult.length) {
        const lastUpdatedResult = updatedResult[updatedResult.length - 1];

        nextUpdatesCursor = {
          id: lastUpdatedResult.id,
          updatedAt: lastUpdatedResult.updated_ts,
        };
      }

      const removedAttributeKeys = removedResult.map((r) => ({
        id: r.id,
        collection_id: r.collection_id,
        key: r.key,
        kind: r.kind,
        rank: r.rank,
        created_at: new Date(r.created_at).toISOString(),
        updated_at: new Date(r.deleted_ts * 1000).toISOString(),
        is_active: false,
      }));

      let nextRemovalsCursor = _.clone(removalsCursor);

      if (removedResult.length) {
        const lastRemovedResult = removedResult[removedResult.length - 1];

        nextRemovalsCursor = {
          id: lastRemovedResult.id,
          deletedAt: lastRemovedResult.deleted_ts,
        };
      }

      return {
        data: updatedAttributeKeys.concat(removedAttributeKeys),
        nextCursor: {
          updates: nextUpdatesCursor,
          removals: nextRemovalsCursor,
        },
      };
    }

    return { data: [], nextCursor: null };
  }
}

type UpdatesCursorInfo = {
  id: number;
  updatedAt: string;
};

type RemovalsCursorInfo = {
  id: number;
  deletedAt: string;
};

type CursorInfo = {
  updates?: UpdatesCursorInfo;
  removals?: RemovalsCursorInfo;
};
