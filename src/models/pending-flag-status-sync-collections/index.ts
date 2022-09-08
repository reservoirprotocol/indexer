import { redis } from "@/common/redis";

/**
 * Class that manage redis list of tokens, pending flag status sync
 */
export class PendingFlagStatusSyncCollections {
  public key = "pending-flag-status-sync-collections";

  public async add(collectionId: string) {
    return await redis.zadd(this.key, "NX", Date.now(), collectionId);
  }

  public async next(): Promise<string | null> {
    const result = await redis.zrangebyscore(this.key, "-inf", "-inf");
    return result.length ? result[0] : null;
  }

  public async remove(collectionId: string): Promise<number> {
    return await redis.zrem(this.key, collectionId);
  }

  public async count(): Promise<number> {
    return await redis.zcard(this.key);
  }

  public async exists(collectionId: string) {
    return await redis.zscore(this.key, collectionId);
  }
}
