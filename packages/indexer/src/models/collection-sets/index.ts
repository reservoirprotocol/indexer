/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";
import crypto from "crypto";
import { redb, idb } from "@/common/db";

export class CollectionSets {
  public static getCollectionsSetId(collectionIds: string[]) {
    return crypto.createHash("sha256").update(_.sortBy(collectionIds).toString()).digest("hex");
  }

  public static async add(collectionIds: string[]) {
    // Sort the collections and create a unique hash
    const collectionsHash = CollectionSets.getCollectionsSetId(collectionIds);

    let query = `
      INSERT INTO collections_sets (collections_hash)
      VALUES ($/collectionsHash/)
      ON CONFLICT DO NOTHING
      RETURNING id
    `;

    await idb.oneOrNone(query, {
      collectionsHash,
    });

    const replacementParams = {};
    let assignCollectionToSetString = "";

    _.forEach(collectionIds, (collectionId, index) => {
      (replacementParams as any)[`${index}`] = collectionId;
      assignCollectionToSetString += `('${collectionsHash}', $/${index}/),`;
    });

    assignCollectionToSetString = _.trimEnd(assignCollectionToSetString, ",");

    query = `
        INSERT INTO collections_sets_collections (collections_set_id, collection_id)
        VALUES ${assignCollectionToSetString}
        ON CONFLICT DO NOTHING
    `;

    await idb.none(query, replacementParams);

    return collectionsHash;
  }

  public static async getCollectionsIds(collectionsSetId: string): Promise<string[]> {
    const query = `
      SELECT collection_id
      FROM collections_sets_collections
      WHERE collections_set_id = $/collectionsSetId/
    `;

    const collections = await redb.manyOrNone(query, { collectionsSetId });
    return _.map(collections, (collection) => collection.collection_id);
  }
}
