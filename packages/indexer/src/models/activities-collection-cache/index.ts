/* eslint-disable @typescript-eslint/no-explicit-any */

import { redis } from "@/common/redis";
import _ from "lodash";
import { redb } from "@/common/db";
import { ActivityDocument } from "@/elasticsearch/indexes/activities/base";

export interface CollectionData {
  id: string;
  name: string;
  image: string;
  image_version: string;
}

export class ActivitiesCollectionCache {
  public static prefix = `activities-collection-cache`;

  public static async getCollections(activities: ActivityDocument[]): Promise<CollectionData[]> {
    let cachedCollections: any[] = [];

    let collectionsToFetch = activities
      .filter((activity) => activity.collection)
      .map((activity) => `${ActivitiesCollectionCache.prefix}:${activity.collection?.id}`);

    if (collectionsToFetch.length) {
      // Make sure each token is unique
      collectionsToFetch = [...new Set(collectionsToFetch).keys()];

      cachedCollections = await redis.mget(collectionsToFetch);
      cachedCollections = cachedCollections
        .filter((collection) => collection)
        .map((collection) => JSON.parse(collection));

      const nonCachedCollectionsToFetch = collectionsToFetch.filter((collectionToFetch) => {
        const collectionId = collectionToFetch.slice(ActivitiesCollectionCache.prefix.length + 1);

        return (
          cachedCollections.find((collection) => {
            return collection.id === collectionId;
          }) === undefined
        );
      });

      if (nonCachedCollectionsToFetch.length) {
        const collectionsFilter = [];

        for (const nonCachedCollectionToFetch of nonCachedCollectionsToFetch) {
          const collectionId = nonCachedCollectionToFetch.slice(
            ActivitiesCollectionCache.prefix.length + 1
          );

          collectionsFilter.push(`'${collectionId}'`);
        }

        // Fetch collections from database
        const collectionsResult = await redb.manyOrNone(
          `
          SELECT
            collections.id,
            collections.name,
            (collections.metadata ->> 'imageUrl')::TEXT AS "image",
            collections.image_version AS "image_version"
          FROM collections
          WHERE collections.id IN ($/collectionsFilter:raw/)
        `,
          { collectionsFilter: _.join(collectionsFilter, ",") }
        );

        if (collectionsResult?.length) {
          cachedCollections = cachedCollections.concat(
            collectionsResult.map((collection) => ({
              id: collection.id,
              name: collection.name,
              image: collection.image,
              image_version: collection.image_version,
            }))
          );

          const redisMulti = redis.multi();

          for (const collectionResult of collectionsResult) {
            await redisMulti.set(
              `${ActivitiesCollectionCache.prefix}:${collectionResult.id}`,
              JSON.stringify({
                id: collectionResult.id,
                name: collectionResult.name,
                image: collectionResult.image,
                image_version: collectionResult.image_version,
              })
            );

            await redisMulti.expire(
              `${ActivitiesCollectionCache.prefix}:${collectionResult.id}`,
              60 * 60 * 24
            );
          }

          await redisMulti.exec();
        }
      }
    }

    return cachedCollections;
  }

  public static async refreshCollection(collectionId: string, collectionData: CollectionData) {
    await redis.set(
      `${ActivitiesCollectionCache.prefix}:${collectionId}`,
      JSON.stringify({
        id: collectionData.id,
        name: collectionData.name,
        image: collectionData.image,
        image_version: collectionData.image_version,
      }),
      "EX",
      60 * 60 * 24,
      "XX"
    );
  }
}
