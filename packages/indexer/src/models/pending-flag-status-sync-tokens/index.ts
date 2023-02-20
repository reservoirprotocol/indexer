import _ from "lodash";
import { redis } from "@/common/redis";

export type PendingFlagStatusSyncToken = {
  collectionId: string;
  contract: string;
  tokenId: string;
  isFlagged: number;
};

/**
 * Class that manage redis list of tokens, pending flag status sync
 */
export class PendingFlagStatusSyncTokens {
  public key = "pending-flag-status-sync-tokens";

  public constructor(collectionId: string) {
    this.key += `:${collectionId}`;
  }

  public async add(tokens: PendingFlagStatusSyncToken[], prioritized = false) {
    if (prioritized) {
      return await redis.lpush(
        this.key,
        _.map(tokens, (token) => JSON.stringify(token))
      );
    } else {
      return await redis.rpush(
        this.key,
        _.map(tokens, (token) => JSON.stringify(token))
      );
    }
  }

  public async get(count = 1): Promise<PendingFlagStatusSyncToken[]> {
    const tokens = await redis.lpop(this.key, count);
    if (tokens) {
      return _.map(tokens, (token) => JSON.parse(token) as PendingFlagStatusSyncToken);
    }

    return [];
  }

  public async count(): Promise<number> {
    return await redis.llen(this.key);
  }
}
