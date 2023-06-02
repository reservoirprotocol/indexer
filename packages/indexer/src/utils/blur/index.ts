import { AddressZero } from "@ethersproject/constants";
import axios from "axios";

import { redb } from "@/common/db";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import { logger } from "@/common/logger";

export const updateBlurRoyalties = async (collection: string, skipCache = false) => {
  // Blur is only available on mainnet
  if (config.chainId === 1) {
    try {
      if (collection.includes(":")) {
        return undefined;
      }

      const { minimumRoyaltyBps, maximumRoyaltyBps } = await axios
        .get(
          `${config.orderFetcherBaseUrl}/api/blur-collection-fees?collection=${collection}${
            skipCache ? "&skipCache=1" : ""
          }`
        )
        .then(
          (response) => response.data as { minimumRoyaltyBps: number; maximumRoyaltyBps: number }
        );

      logger.info(
        "blur-royalties",
        `Updating blur royalties for collection ${collection} to minBps=${minimumRoyaltyBps} maxBps=${maximumRoyaltyBps}`
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
          recipient: result.new_royalties?.opensea?.[0]?.recipient ?? AddressZero,
          bps: minimumRoyaltyBps,
          maxBps: maximumRoyaltyBps,
        })
      );

      return getBlurRoyalties(collection);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      // Usually 500 errors mean the collection is not supported on Blur, so we just ignore them
      if (error.response?.status !== 500) {
        logger.error(
          "blur-royalties",
          `Failed to update blur royalties for collection ${collection}. Error: ${error}`
        );
      }
    }
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

export const getOrUpdateBlurRoyalties = async (collection: string) => {
  let royalties = await getBlurRoyalties(collection);
  if (!royalties) {
    royalties = await updateBlurRoyalties(collection);
  }
  return royalties;
};
