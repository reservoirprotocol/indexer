import { ridb } from "@/common/db";
import { fromBuffer, toBuffer } from "@/common/utils";
import { BaseDataSource } from "@/jobs/data-export/data-sources/index";
import crypto from "crypto";
import _ from "lodash";

export class TokenAttributesDataSource extends BaseDataSource {
  public async getSequenceData(cursor: CursorInfo | null, limit: number) {
    const updatesCursor = cursor?.updates;
    const removalsCursor = cursor?.removals;

    let updatesContinuationFilter = "";

    if (updatesCursor) {
      updatesContinuationFilter = `WHERE (updated_at, contract, token_id, attribute_id) > (to_timestamp($/updatedAt/), $/contract/, $/tokenId/, $/attributeId/)`;
    }

    const updatedQuery = `
        SELECT
          contract,
          token_id,
          attribute_id,
          collection_id,
          key,
          value,
          created_at,
          extract(epoch from updated_at) updated_ts
        FROM token_attributes
        ${updatesContinuationFilter}
        ORDER BY updated_at, contract, token_id, attribute_id
        LIMIT $/limit/;  
      `;

    const updatedResult = await ridb.manyOrNone(updatedQuery, {
      contract: updatesCursor?.contract ? toBuffer(updatesCursor.contract) : null,
      tokenId: updatesCursor?.tokenId,
      attributeId: updatesCursor?.attributeId,
      updatedAt: updatesCursor?.updatedAt,
      limit,
    });

    let removalsContinuationFilter = "";

    if (removalsCursor) {
      removalsContinuationFilter = `WHERE (deleted_at, contract, token_id, attribute_id) > (to_timestamp($/deletedAt/), $/contract/, $/tokenId/, $/attributeId/)`;
    }

    const removedQuery = `
        SELECT
          contract,
          token_id,
          attribute_id,
          collection_id,
          key,
          value,
          created_at,
          extract(epoch from deleted_at) deleted_ts
        FROM removed_token_attributes
        ${removalsContinuationFilter}
        ORDER BY deleted_at, contract, token_id, attribute_id
        LIMIT $/limit/;  
      `;

    const removedResult = await ridb.manyOrNone(removedQuery, {
      contract: removalsCursor?.contract ? toBuffer(removalsCursor.contract) : null,
      tokenId: removalsCursor?.tokenId,
      attributeId: removalsCursor?.attributeId,
      deletedAt: removalsCursor?.deletedAt,
      limit,
    });

    if (updatedResult.length || removedResult.length) {
      const updatedTokenAttributes = updatedResult.map((r) => ({
        id: crypto
          .createHash("sha256")
          .update(`${fromBuffer(r.contract)}${r.token_id}${r.attribute_id}`)
          .digest("hex"),
        contract: fromBuffer(r.contract),
        token_id: r.token_id,
        attribute_id: r.attribute_id,
        collection_id: r.collection_id,
        key: r.key,
        value: r.value,
        created_at: new Date(r.created_at).toISOString(),
        updated_at: new Date(r.updated_ts * 1000).toISOString(),
        is_active: true,
      }));

      let nextUpdatesCursor = _.clone(updatesCursor);

      if (updatedResult.length) {
        const lastUpdatedResult = updatedResult[updatedResult.length - 1];

        nextUpdatesCursor = {
          contract: fromBuffer(lastUpdatedResult.contract),
          tokenId: lastUpdatedResult.token_id,
          attributeId: lastUpdatedResult.attribute_id,
          updatedAt: lastUpdatedResult.updated_ts,
        };
      }

      const removedTokenAttributes = removedResult.map((r) => ({
        id: crypto
          .createHash("sha256")
          .update(`${fromBuffer(r.contract)}${r.token_id}${r.attribute_id}`)
          .digest("hex"),
        contract: fromBuffer(r.contract),
        token_id: r.token_id,
        attribute_id: r.attribute_id,
        collection_id: r.collection_id,
        key: r.key,
        value: r.value,
        created_at: new Date(r.created_at).toISOString(),
        updated_at: new Date(r.deleted_ts * 1000).toISOString(),
        is_active: false,
      }));

      let nextRemovalsCursor = _.clone(removalsCursor);

      if (removedResult.length) {
        const lastDeletedResult = removedResult[removedResult.length - 1];

        nextRemovalsCursor = {
          contract: fromBuffer(lastDeletedResult.contract),
          tokenId: lastDeletedResult.token_id,
          attributeId: lastDeletedResult.attribute_id,
          deletedAt: lastDeletedResult.deleted_ts,
        };
      }

      return {
        data: updatedTokenAttributes.concat(removedTokenAttributes),
        nextCursor: {
          updates: nextUpdatesCursor,
          removals: nextRemovalsCursor,
        },
      };
    }

    return { data: [], nextCursor: null };
  }
}

export class TokenAttributesDataSourceV2 extends BaseDataSource {
  public async getSequenceData(cursor: CursorInfo | null, limit: number) {
    const updatesCursor = cursor?.updates;
    const removalsCursor = cursor?.removals;

    let updatesContinuationFilter = "";

    if (updatesCursor) {
      updatesContinuationFilter = `AND  (updated_at, contract, token_id, attribute_id) > (to_timestamp($/updatedAt/), $/contract/, $/tokenId/, $/attributeId/)`;
    }

    const updatedQuery = `
        SELECT
          contract,
          token_id,
          attribute_id,
          collection_id,
          key,
          value,
          created_at,
          extract(epoch from updated_at) updated_ts
        FROM token_attributes
        WHERE updated_at < NOW() - INTERVAL '1 minutes'
        ${updatesContinuationFilter}
        ORDER BY updated_at, contract, token_id, attribute_id
        LIMIT $/limit/;  
      `;

    const updatedResult = await ridb.manyOrNone(updatedQuery, {
      contract: updatesCursor?.contract ? toBuffer(updatesCursor.contract) : null,
      tokenId: updatesCursor?.tokenId,
      attributeId: updatesCursor?.attributeId,
      updatedAt: updatesCursor?.updatedAt,
      limit,
    });

    let removalsContinuationFilter = "";

    if (removalsCursor) {
      removalsContinuationFilter = `AND (deleted_at, contract, token_id, attribute_id) > (to_timestamp($/deletedAt/), $/contract/, $/tokenId/, $/attributeId/)`;
    }

    const removedQuery = `
        SELECT
          contract,
          token_id,
          attribute_id,
          collection_id,
          key,
          value,
          created_at,
          extract(epoch from deleted_at) deleted_ts
        FROM removed_token_attributes
        WHERE deleted_at < NOW() - INTERVAL '1 minutes'
        ${removalsContinuationFilter}
        ORDER BY deleted_at, contract, token_id, attribute_id
        LIMIT $/limit/;  
      `;

    const removedResult = await ridb.manyOrNone(removedQuery, {
      contract: removalsCursor?.contract ? toBuffer(removalsCursor.contract) : null,
      tokenId: removalsCursor?.tokenId,
      attributeId: removalsCursor?.attributeId,
      deletedAt: removalsCursor?.deletedAt,
      limit,
    });

    if (updatedResult.length || removedResult.length) {
      const updatedTokenAttributes = updatedResult.map((r) => ({
        id: crypto
          .createHash("sha256")
          .update(`${fromBuffer(r.contract)}${r.token_id}${r.attribute_id}`)
          .digest("hex"),
        contract: fromBuffer(r.contract),
        token_id: r.token_id,
        attribute_id: r.attribute_id,
        collection_id: r.collection_id,
        key: r.key,
        value: r.value,
        created_at: new Date(r.created_at).toISOString(),
        updated_at: new Date(r.updated_ts * 1000).toISOString(),
        is_active: true,
      }));

      let nextUpdatesCursor = _.clone(updatesCursor);

      if (updatedResult.length) {
        const lastUpdatedResult = updatedResult[updatedResult.length - 1];

        nextUpdatesCursor = {
          contract: fromBuffer(lastUpdatedResult.contract),
          tokenId: lastUpdatedResult.token_id,
          attributeId: lastUpdatedResult.attribute_id,
          updatedAt: lastUpdatedResult.updated_ts,
        };
      }

      const removedTokenAttributes = removedResult.map((r) => ({
        id: crypto
          .createHash("sha256")
          .update(`${fromBuffer(r.contract)}${r.token_id}${r.attribute_id}`)
          .digest("hex"),
        contract: fromBuffer(r.contract),
        token_id: r.token_id,
        attribute_id: r.attribute_id,
        collection_id: r.collection_id,
        key: r.key,
        value: r.value,
        created_at: new Date(r.created_at).toISOString(),
        updated_at: new Date(r.deleted_ts * 1000).toISOString(),
        is_active: false,
      }));

      let nextRemovalsCursor = _.clone(removalsCursor);

      if (removedResult.length) {
        const lastDeletedResult = removedResult[removedResult.length - 1];

        nextRemovalsCursor = {
          contract: fromBuffer(lastDeletedResult.contract),
          tokenId: lastDeletedResult.token_id,
          attributeId: lastDeletedResult.attribute_id,
          deletedAt: lastDeletedResult.deleted_ts,
        };
      }

      return {
        data: updatedTokenAttributes.concat(removedTokenAttributes),
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
  contract: string;
  tokenId: number;
  attributeId: number;
  updatedAt: string;
};

type RemovalsCursorInfo = {
  contract: string;
  tokenId: number;
  attributeId: number;
  deletedAt: string;
};

type CursorInfo = {
  updates?: UpdatesCursorInfo;
  removals?: RemovalsCursorInfo;
};
