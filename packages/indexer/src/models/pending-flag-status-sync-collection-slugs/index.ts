import _ from "lodash";
import { redis } from "@/common/redis";
import { getOpenseaNetworkName } from "@/config/network";

export type PendingFlagStatusSyncCollection = {
  slug: string;
  contract: string;
  continuation: string | null;
  collectionId: string;
};

/**
 * Class that manage redis list of tokens, pending metadata sync
 */
export class PendingFlagStatusSyncCollectionSlugs {
  public static key = "pending-flag-status-sync-collection-slugs";

  public static async add(syncCollection: PendingFlagStatusSyncCollection[], prioritized = false) {
    if (!getOpenseaNetworkName()) {
      return;
    }

    if (prioritized) {
      return await redis.lpush(
        this.key,
        _.map(syncCollection, (token) => JSON.stringify(token))
      );
    } else {
      return await redis.rpush(
        this.key,
        _.map(syncCollection, (token) => JSON.stringify(token))
      );
    }
  }

  public static async get(count = 20): Promise<PendingFlagStatusSyncCollection[]> {
    const syncCollections = await redis.lpop(this.key, count);
    if (syncCollections) {
      return _.map(
        syncCollections,
        (syncCollection) => JSON.parse(syncCollection) as PendingFlagStatusSyncCollection
      );
    }

    return [];
  }

  public static async count(): Promise<number> {
    return await redis.llen(this.key);
  }
}
