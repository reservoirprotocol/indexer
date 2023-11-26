/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  CollectionsOverrideEntity,
  CollectionsOverrideMetadata,
  CollectionsOverrideRoyalties,
} from "@/models/collections-override/collections-override-entity";
import _ from "lodash";
import { idb, ridb } from "@/common/db";

export class CollectionsOverride {
  public static async upsert(
    collection: string,
    metadata: CollectionsOverrideMetadata,
    royalties: CollectionsOverrideRoyalties | null
  ) {
    let updateString = "";
    const replacementValues = {
      collection,
    };

    const metadataFieldsToRemove: string[] = [];
    const metadataFields: { [key: string]: string } = {};

    _.forEach(metadata, (value, fieldName) => {
      if (_.isNull(value)) {
        metadataFieldsToRemove.push(fieldName);
      } else if (!_.isUndefined(value)) {
        metadataFields[fieldName] = value;
      }
    });

    updateString += `metadata = COALESCE(collections_override.metadata, '{}') || $/metadata:json/,`;
    (replacementValues as any)[`metadata`] = metadataFields;

    if (!_.isUndefined(royalties)) {
      updateString += _.isNull(royalties)
        ? `royalties = $/royalties/,`
        : `royalties = '$/royalties:raw/'::jsonb,`;
      (replacementValues as any)[`royalties`] = _.isNull(royalties)
        ? royalties
        : JSON.stringify(royalties);
    }

    updateString = _.trimEnd(updateString, ",");

    const query = `
        INSERT INTO collections_override(
          collection_id,
          metadata
          ${royalties ? ", royalties" : ""}
        ) VALUES (
          $/collection/,
          $/metadata/
          ${royalties ? ",  $/royalties/" : ""}
        ) 
        ON CONFLICT (collection_id) DO UPDATE
        SET ${updateString}, updated_at = NOW()
      `;

    await idb.none(query, replacementValues);

    if (!_.isEmpty(metadataFieldsToRemove)) {
      const deleteQuery = `
        UPDATE collections_override
        SET metadata = collections_override.metadata - '${_.join(metadataFieldsToRemove, "' - '")}'
        WHERE collection_id = $/collection/
      `;

      await idb.none(deleteQuery, { collection });
    }
  }

  public static async get(collection: string) {
    const query = `
      SELECT *
      FROM collections_override
      WHERE collection_id = $/collection/
    `;

    const result = await ridb.oneOrNone(query, { collection });
    if (result) {
      return new CollectionsOverrideEntity(result);
    }

    return null;
  }
}
