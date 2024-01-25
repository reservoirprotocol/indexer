/* eslint-disable @typescript-eslint/no-explicit-any */

import { redis } from "@/common/redis";
import _ from "lodash";
import { redb } from "@/common/db";
import { CollectionMintStandard } from "@/orderbook/mints";

export interface MintingCollectionData {
  collection_id: string;
  start_time: string;
  end_time: string;
  created_at: string;
  updated_at: string;
  max_supply: string;
  max_mints_per_wallet: number;
  price: string;
  standard: CollectionMintStandard;
  kind: string;
  status: string;
}

export class TrendingMintsMintingCollectionCache {
  public static prefix = `trending-mints-minting-collection-cache`;

  public static async getMintingCollections(
    collectionIds: string[]
  ): Promise<MintingCollectionData[]> {
    let cachedCollections: any[] = [];

    let collectionsToFetch = collectionIds.map(
      (collectionId) => `${TrendingMintsMintingCollectionCache.prefix}:${collectionId}`
    );

    if (collectionsToFetch.length) {
      collectionsToFetch = [...new Set(collectionsToFetch).keys()];

      cachedCollections = await redis.mget(collectionsToFetch);
      cachedCollections = cachedCollections
        .filter((collection) => collection)
        .map((collection) => JSON.parse(collection));

      const nonCachedCollectionsToFetch = collectionsToFetch.filter((collectionToFetch) => {
        const collectionId = collectionToFetch.slice(
          TrendingMintsMintingCollectionCache.prefix.length + 1
        );

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
            TrendingMintsMintingCollectionCache.prefix.length + 1
          );

          collectionsFilter.push(`'${collectionId}'`);
        }

        // Fetch collections from database
        const collectionsResult = await redb.manyOrNone(
          `
            SELECT 
              mints.collection_id, 
              start_time, 
              end_time, 
              created_at, 
              updated_at, 
              max_supply, 
              max_mints_per_wallet, 
              price, 
              standard,
              kind,
              status 
            FROM 
              collection_mints mints 
              LEFT JOIN collection_mint_standards ON collection_mint_standards.collection_id = mints.collection_id
            WHERE mints.collection_id IN ($/collectionsFilter:raw/)
        `,
          { collectionsFilter: _.join(collectionsFilter, ",") }
        );

        if (collectionsResult?.length) {
          cachedCollections = cachedCollections.concat(
            collectionsResult.map((result) => ({
              collection_id: result.collection_id,
              start_time: result.start_time,
              end_time: result.end_time,
              created_at: result.created_at,
              updated_at: result.updated_at,
              max_supply: result.max_supply,
              max_mints_per_wallet: result.max_mints_per_wallet,
              price: result.price,
              standard: result.standard,
              kind: result.kind,
              status: result.status,
            }))
          );

          const redisMulti = redis.multi();

          for (const collectionResult of collectionsResult) {
            await redisMulti.set(
              `${TrendingMintsMintingCollectionCache.prefix}:${collectionResult.collection_id}`,
              JSON.stringify({
                collection_id: collectionResult.collection_id,
                start_time: collectionResult.start_time,
                end_time: collectionResult.end_time,
                created_at: collectionResult.created_at,
                updated_at: collectionResult.updated_at,
                max_supply: collectionResult.max_supply,
                max_mints_per_wallet: collectionResult.max_mints_per_wallet,
                price: collectionResult.price,
                standard: collectionResult.standard,
                kind: collectionResult.kind,
                status: collectionResult.status,
              })
            );

            await redisMulti.expire(
              `${TrendingMintsMintingCollectionCache.prefix}:${collectionResult.collection_id}`,
              60 * 60
            );
          }

          await redisMulti.exec();
        }
      }
    }

    return cachedCollections;
  }
}
