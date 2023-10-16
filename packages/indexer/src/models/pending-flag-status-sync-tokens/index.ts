import _ from "lodash";
import { redis } from "@/common/redis";
import { config } from "@/config/index";

export type PendingFlagStatusSyncToken = {
  contract: string;
  tokenId: string;
};

/**
 * Class that manage redis list of tokens, pending flag status sync
 */
export class PendingFlagStatusSyncTokens {
  public static key = "pending-flag-status-sync-tokens";

  public static async add(tokens: PendingFlagStatusSyncToken[], prioritized = false) {
    if (config.metadataIndexingMethodCollection !== "opensea") {
      return;
    }
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

  public static async get(count = 1): Promise<PendingFlagStatusSyncToken[]> {
    const tokens = await redis.lpop(this.key, count);
    if (tokens) {
      return _.map(tokens, (token) => JSON.parse(token) as PendingFlagStatusSyncToken);
    }

    return [];
  }

  public static async count(): Promise<number> {
    return await redis.llen(this.key);
  }
}
