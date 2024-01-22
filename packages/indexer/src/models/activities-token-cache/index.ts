/* eslint-disable @typescript-eslint/no-explicit-any */

import { redis } from "@/common/redis";
import _ from "lodash";
import { redb } from "@/common/db";
import { ActivityDocument } from "@/elasticsearch/indexes/activities/base";
import { fromBuffer } from "@/common/utils";

export interface TokenData {
  contract: string;
  token_id: string;
  name: string;
  image: string;
  image_version: string;
  metadata_disabled: number;
  rarity_rank: number;
  rarity_score: number;
}

export class ActivitiesTokenCache {
  public static prefix = `activities-token-cache`;

  public static async getTokens(activities: ActivityDocument[]): Promise<TokenData[]> {
    let cachedTokens: any[] = [];

    let tokensToFetch = activities
      .filter((activity) => activity.token)
      .map(
        (activity) => `${ActivitiesTokenCache.prefix}:${activity.contract}:${activity.token?.id}`
      );

    if (tokensToFetch.length) {
      // Make sure each token is unique
      tokensToFetch = [...new Set(tokensToFetch).keys()];

      cachedTokens = await redis.mget(tokensToFetch);
      cachedTokens = cachedTokens.filter((token) => token).map((token) => JSON.parse(token));

      const nonCachedTokensToFetch = tokensToFetch.filter((tokenToFetch) => {
        const [, contract, tokenId] = tokenToFetch.split(":");

        return (
          cachedTokens.find((token) => {
            return token.contract === contract && token.token_id === tokenId;
          }) === undefined
        );
      });

      if (nonCachedTokensToFetch.length) {
        const tokensFilter = [];

        for (const nonCachedTokenToFetch of nonCachedTokensToFetch) {
          const [, contract, tokenId] = nonCachedTokenToFetch.split(":");

          tokensFilter.push(`('${_.replace(contract, "0x", "\\x")}', '${tokenId}')`);
        }

        // Fetch collections from database
        const tokensResult = await redb.manyOrNone(
          `
          SELECT
            tokens.contract,
            tokens.token_id,
            tokens.name,
            tokens.image,
            tokens.image_version,
            tokens.metadata_disabled,
            tokens.rarity_score,
            tokens.rarity_rank
          FROM tokens
          WHERE (tokens.contract, tokens.token_id) IN ($/tokensFilter:raw/)
        `,
          { tokensFilter: _.join(tokensFilter, ",") }
        );

        if (tokensResult?.length) {
          cachedTokens = cachedTokens.concat(
            tokensResult.map((token) => ({
              contract: fromBuffer(token.contract),
              token_id: token.token_id,
              name: token.name,
              image: token.image,
              image_version: token.image_version,
              metadata_disabled: token.metadata_disabled,
              rarity_score: token.rarity_score,
              rarity_rank: token.rarity_rank,
            }))
          );

          const redisMulti = redis.multi();

          for (const tokenResult of tokensResult) {
            const tokenResultContract = fromBuffer(tokenResult.contract);
            const cacheKey = `${ActivitiesTokenCache.prefix}:${tokenResultContract}:${tokenResult.token_id}`;

            await redisMulti.set(
              cacheKey,
              JSON.stringify({
                contract: tokenResultContract,
                token_id: tokenResult.token_id,
                name: tokenResult.name,
                image: tokenResult.image,
                image_version: tokenResult.image_version,
                metadata_disabled: tokenResult.metadata_disabled,
                rarity_score: tokenResult.rarity_score,
                rarity_rank: tokenResult.rarity_rank,
              })
            );

            await redisMulti.expire(cacheKey, 60 * 60 * 24);
          }

          await redisMulti.exec();
        }
      }
    }

    return cachedTokens;
  }

  public static async refreshTokens(contract: string, tokenId: string, tokenData: TokenData) {
    const cacheKey = `${ActivitiesTokenCache.prefix}:${contract}:${tokenId}`;

    await redis.set(
      cacheKey,
      JSON.stringify({
        contract: tokenData.contract,
        token_id: tokenData.token_id,
        name: tokenData.name,
        image: tokenData.image,
        image_version: tokenData.image_version,
        metadata_disabled: tokenData.metadata_disabled,
        rarity_rank: tokenData.rarity_rank,
        rarity_score: tokenData.rarity_score,
      }),
      "EX",
      60 * 60 * 24,
      "XX"
    );
  }
}
