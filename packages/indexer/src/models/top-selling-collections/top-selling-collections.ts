import { redis } from "@/common/redis";
import {
  getTopSellingCollectionsV2 as getTopSellingCollections,
  TopSellingFillOptions,
} from "@/elasticsearch/indexes/activities";

import { CollectionAggregation } from "@/elasticsearch/indexes/activities/base";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";

const VERSION = "v2";
const expireTimeInSeconds = 1800;

export type Period = "5m" | "10m" | "30m" | "1h" | "6h" | "1d" | "7d" | "30d";
type FillSort = "volume" | "sales";

interface TopSellingCollectionWindow {
  period: Period;
  fillSort: FillSort;
  collections: CollectionAggregation[];
}

export const getStartTime = (period: Period): number => {
  const now = Math.floor(new Date().getTime() / 1000);

  let startTime = now - 60 * 24 * 60;

  switch (period) {
    case "5m": {
      startTime = now - 5 * 60;
      break;
    }

    case "10m": {
      startTime = now - 10 * 60;
      break;
    }
    case "30m": {
      startTime = now - 30 * 60;
      break;
    }
    case "1h": {
      startTime = now - 60 * 60;
      break;
    }
    case "6h": {
      startTime = now - 60 * 6 * 60;
      break;
    }

    case "7d": {
      startTime = now - 60 * 24 * 60 * 7;
      break;
    }

    case "30d": {
      startTime = now - 60 * 24 * 60 * 30;
      break;
    }
  }
  return startTime;
};

export const saveActiveSpamCollectionIds = async () => {
  const query = `
    SELECT 
      collections.id
    FROM collections
    WHERE
      day30_volume > 0 AND
      is_spam = 1
  `;

  const results = await redb.manyOrNone(query);
  const ids = results.map((r) => r.id);
  await redis.set("active-spam-collection-ids", JSON.stringify(ids));
};

export class TopSellingCollections {
  public static async updateTopSellingCollections(): Promise<TopSellingCollectionWindow[]> {
    const periods: Period[] = ["1h", "6h", "1d", "7d", "30d"];
    const fillSorts: FillSort[] = ["volume", "sales"];

    try {
      await saveActiveSpamCollectionIds();
    } catch (err) {
      logger.error("top-selling-collections", `failed to update active spam collection ids ${err}`);
    }

    const tasks = fillSorts.flatMap((fillSort) => {
      return periods.map(async (period) => {
        const startTime = getStartTime(period);
        const topSellingCollections = await getTopSellingCollections({
          startTime,
          fillType: TopSellingFillOptions.sale,
          limit: 1000,
          sortBy: fillSort,
        });

        return {
          period,
          fillSort,
          collections: topSellingCollections,
        };
      });
    });

    const results: TopSellingCollectionWindow[] = await Promise.all(tasks);

    const pipeline = redis.pipeline();

    results.forEach(({ period, collections, fillSort }: TopSellingCollectionWindow) => {
      const key = `top-selling-collections:${VERSION}:${period}:sale:${fillSort}`;
      const value = JSON.stringify(collections);
      pipeline.set(key, value, "EX", expireTimeInSeconds);
    });

    await pipeline.exec();

    return results;
  }
}
