/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";

import { idb } from "@/common/db";
import { AttributeKeysEntityParamsUpdateParams } from "@/models/attribute-keys/attribute-keys-entity";

export class AttributeKeys {
  public static async update(
    collectionId: string,
    key: string,
    fields: AttributeKeysEntityParamsUpdateParams
  ) {
    let updateString = "";
    const replacementValues = {
      collectionId,
      key,
    };

    _.forEach(fields, (value, fieldName) => {
      updateString += `${_.snakeCase(fieldName)} = $/${fieldName}/,`;
      (replacementValues as any)[fieldName] = value;
    });

    updateString = _.trimEnd(updateString, ",");

    const query = `UPDATE attribute_keys
                   SET updated_at = now(),
                       ${updateString}
                   WHERE collection_id = $/collectionId/
                   AND key = $/key/`;

    return await idb.none(query, replacementValues);
  }

  public static async delete(collectionId: string, key: string) {
    const replacementValues = {
      collectionId,
      key,
    };

    const query = `WITH x AS (
                    DELETE FROM attribute_keys
                    WHERE collection_id = $/collectionId/
                    AND key = $/key/
                    RETURNING id, collection_id, key, kind, rank, attribute_count, info, created_at
                   ) INSERT INTO removed_attribute_keys SELECT * FROM x;`;

    return await idb.none(query, replacementValues);
  }
}
