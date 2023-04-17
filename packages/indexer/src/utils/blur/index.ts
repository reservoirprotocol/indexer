import axios from "axios";

import { redb } from "@/common/db";
import { redis } from "@/common/redis";
import { config } from "@/config/index";

export const updateBlurRoyalties = async (collection: string) => {
  try {
    const { minimumRoyaltyBps, maximumRoyaltyBps } = await axios
      .get(`${config.orderFetcherBaseUrl}/api/blur-collection-fees?collection=${collection}`)
      .then(
        (response) => response.data as { minimumRoyaltyBps: number; maximumRoyaltyBps: number }
      );

    if (minimumRoyaltyBps > 0 || maximumRoyaltyBps > 0) {
      const result = await redb.oneOrNone(
        `
          SELECT
            collections.new_royalties
          FROM collections
          WHERE collections.id = $/collection/
        `,
        { collection }
      );
      if (result?.new_royalties?.opensea.length) {
        await redis.set(
          `blur-royalties:${collection}`,
          JSON.stringify({
            recipient: result.new_royalties.opensea[0].recipient,
            bps: minimumRoyaltyBps,
            maxBps: maximumRoyaltyBps,
          })
        );
      }
    }
  } catch {
    // Skip errors
  }
};

export const getBlurRoyalties = async (collection: string) => {
  const result = await redis
    .get(`blur-royalties:${collection}`)
    .then((r) => (r ? JSON.parse(r) : r));
  if (!result) {
    return undefined;
  } else {
    return {
      recipient: result.recipient as string,
      minimumRoyaltyBps: result.bps as number,
      maximumRoyaltyBps: result.maxBps as number,
    };
  }
};
