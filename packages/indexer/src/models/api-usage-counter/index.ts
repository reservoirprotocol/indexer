import { redis } from "@/common/redis";
import { format } from "date-fns";
import _ from "lodash";
import { config } from "@/config/index";

export type ApiUsageCount = {
  chainId: number;
  apiKey: string;
  route: string;
  date: string;
  statusCode: number;
  points: number;
  count: number;
};

export class ApiUsageCounter {
  public static key = `api-usage-counter:${config.chainId}`;

  public static async count(
    apiKey: string,
    route: string,
    statusCode: number,
    points: number,
    timestamp: number,
    incrementBy = 1
  ) {
    const date = format(new Date(timestamp), "yyyy-MM-dd HH:00:00");
    const member = `${config.chainId}*${apiKey}*${route}*${date}*${statusCode}*${points}`;
    await redis.zincrby(ApiUsageCounter.key, incrementBy, member);
  }

  public static async popCounts(count = 200) {
    const results = [];
    const counts = await redis.zpopmax(ApiUsageCounter.key, count);

    for (let i = 0; i < counts.length; i += 2) {
      const [chainId, apiKey, route, date, statusCode, points] = _.split(counts[i], "*");
      results.push({
        chainId: _.toInteger(chainId),
        apiKey,
        route,
        date,
        statusCode: _.toInteger(statusCode),
        points: _.toInteger(points) * _.toInteger(counts[i + 1]),
        count: _.toInteger(counts[i + 1]),
      });
    }

    return results;
  }
}
