import { redis } from "@/common/redis";

import {
  getTopSellingCollections,
  TopSellingFillOptions,
} from "@/elasticsearch/indexes/activities";

const VERSION = "v2";
const expireTimeInSeconds = 1800;

export const getStartTime = (period: string) => {
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
      startTime = now - 60 * 1 * 60;
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
  public static async updateTopSellingCollections() {
    const periods = ["30m", "1h", "6h", "1d"];
    // only cache sales sorted by volume for now

    const results = await Promise.all(
      periods.map(async (period) => {
        const startTime = getStartTime(period);
        const topSellingCollections = await getTopSellingCollections({
          startTime,
          fillType: TopSellingFillOptions.sale,
          limit: 50,
          includeRecentSales: true,
          sortBy: "volume",
        });

        return {
          period,
          collections: topSellingCollections,
        };
      })
    );

    const startTime = getStartTime("1d");
    const countCollections = await getTopSellingCollections({
      startTime,
      fillType: TopSellingFillOptions.sale,
      limit: 50,
      includeRecentSales: true,
      sortBy: "sales",
    });

    const pipeline = redis.pipeline();

    pipeline.set(
      `topSellingCollections:${VERSION}:1d:sale:sales`,
      JSON.stringify(countCollections),
      "EX",
      expireTimeInSeconds
    );

    results.forEach(({ period, collections }) => {
      const key = `topSellingCollections:${VERSION}:${period}:sale:volume`;
      const value = JSON.stringify(collections);
      pipeline.set(key, value, "EX", expireTimeInSeconds);
    });

    await pipeline.exec();

    return results;
  }
}
