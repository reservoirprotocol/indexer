import { AddressZero } from "@ethersproject/constants";
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

    const result = await redb.oneOrNone(
      `
        SELECT
          collections.new_royalties
        FROM collections
        WHERE collections.id = $/collection/
      `,
      { collection }
    );

    await redis.set(
      `blur-royalties:${collection}`,
      JSON.stringify({
        recipient: result.new_royalties?.opensea?.[0].recipient ?? AddressZero,
        bps: minimumRoyaltyBps,
        maxBps: maximumRoyaltyBps,
      })
    );

    return getBlurRoyalties(collection);
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
