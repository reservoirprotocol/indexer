import _ from "lodash";
import { redis } from "@/common/redis";

export type RefreshTokens = {
  collection: string;
  contract: string;
  tokenId: string;
  isFallback?: boolean;
};

/**
 * Class that manage redis list of tokens, pending metadata refresh
 */
export class PendingRefreshTokens {
  public key = "pending-refresh-tokens";

  public constructor(method: string) {
    this.key += `:${method}`;
  }

  public async add(refreshToken: RefreshTokens[], prioritized = false) {
    if (prioritized) {
      return await redis.lpush(
        this.key,
        _.map(refreshToken, (token) => JSON.stringify(token))
      );
    } else {
      return await redis.rpush(
        this.key,
        _.map(refreshToken, (token) => JSON.stringify(token))
      );
    }
  }

  public async get(count = 20): Promise<RefreshTokens[]> {
    const refreshTokens = await redis.lpop(this.key, count);
    if (refreshTokens) {
      return _.map(refreshTokens, (refreshToken) => JSON.parse(refreshToken) as RefreshTokens);
    }

    return [];
  }

  public async length(): Promise<number> {
    return await redis.llen(this.key);
  }
}
