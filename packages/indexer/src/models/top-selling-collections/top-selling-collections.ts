import { redis } from "@/common/redis";
import {
  getTopSellingCollectionsV2 as getTopSellingCollections,
  TopSellingFillOptions,
} from "@/elasticsearch/indexes/activities";

import { CollectionAggregation } from "@/elasticsearch/indexes/activities/base";

const VERSION = "v2";
const expireTimeInSeconds = 1800;

type Period = "5m" | "10m" | "30m" | "1h" | "6h" | "1d" | "7d" | "30d";
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

export class TopSellingCollections {
  public static async updateTopSellingCollections(): Promise<TopSellingCollectionWindow[]> {
    const periods: Period[] = ["1h", "6h", "1d", "7d", "30d"];
    const fillSorts: FillSort[] = ["volume", "sales"];

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
