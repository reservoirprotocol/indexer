import { ApiUsageCount } from "@/models/api-usage-counter";
import { idb, pgp } from "@/common/db";
import _ from "lodash";
import { format } from "date-fns";

export class ApiUsage {
  public static async clearOldHourlyCounts(hoursCount = 336) {
    const query = `
      DELETE FROM hourly_api_usage
      WHERE hour < NOW() - INTERVAL '${hoursCount} HOURS'
    `;

    await idb.none(query);
  }

  public static async clearOldDailyCounts(daysCount = 180) {
    const query = `
      DELETE FROM daily_api_usage
      WHERE day < NOW() - INTERVAL '${daysCount} DAYS'
    `;

    await idb.none(query);
  }

  public static async recordCounts(counts: ApiUsageCount[]) {
    await ApiUsage.recordHourlyCounts(counts);
    await ApiUsage.recordDailyCounts(counts);
    await ApiUsage.recordMonthlyCounts(counts);
  }

  private static async recordHourlyCounts(counts: ApiUsageCount[]) {
    const columns = new pgp.helpers.ColumnSet(
      ["api_key", "route", "api_calls_count", "status_code", "points", "hour"],
      { table: "hourly_api_usage" }
    );

    const aggregatedCounts = new Map();

    _.map(counts, (count) => {
      const key = `${count.apiKey}*${count.route}*${count.date}*${count.statusCode}`;

      if (aggregatedCounts.has(key)) {
        aggregatedCounts.get(key).api_calls_count += count.count;
        aggregatedCounts.get(key).points += count.points;
      } else {
        aggregatedCounts.set(key, {
          api_key: count.apiKey,
          route: count.route,
          api_calls_count: count.count,
          status_code: count.statusCode,
          points: count.points,
          hour: count.date,
        });
      }
    });

    const values = Array.from(aggregatedCounts.values());

    const query = `
      INSERT INTO "hourly_api_usage" (
        "api_key",
        "route",
        "api_calls_count",
        "status_code",
        "points",
        "hour"
      )
      VALUES ${pgp.helpers.values(values, columns)}
      ON CONFLICT ("hour", "api_key", "route", "status_code") DO UPDATE
      SET api_calls_count = hourly_api_usage.api_calls_count + EXCLUDED.api_calls_count,
          points = hourly_api_usage.points + EXCLUDED.points, updated_at = now();
    `;

    await idb.none(query);
  }

  private static async recordDailyCounts(counts: ApiUsageCount[]) {
    const columns = new pgp.helpers.ColumnSet(
      ["api_key", "route", "api_calls_count", "status_code", "points", "day"],
      { table: "daily_api_usage" }
    );

    const aggregatedCounts = new Map();

    _.map(counts, (count) => {
      const key = `${count.apiKey}*${count.route}*${format(
        new Date(count.date),
        "yyyy-MM-dd 00:00:00"
      )}*${count.statusCode}`;

      if (aggregatedCounts.has(key)) {
        aggregatedCounts.get(key).api_calls_count += count.count;
        aggregatedCounts.get(key).points += count.points;
      } else {
        aggregatedCounts.set(key, {
          api_key: count.apiKey,
          route: count.route,
          api_calls_count: count.count,
          status_code: count.statusCode,
          points: count.points,
          day: format(new Date(count.date), "yyyy-MM-dd 00:00:00"),
        });
      }
    });

    const values = Array.from(aggregatedCounts.values());

    const query = `
      INSERT INTO "daily_api_usage" (
        "api_key",
        "route",
        "api_calls_count",
        "status_code",
        "points",
        "day"
      )
      VALUES ${pgp.helpers.values(values, columns)}
      ON CONFLICT ("day", "api_key", "route", "status_code") DO UPDATE
      SET api_calls_count = daily_api_usage.api_calls_count + EXCLUDED.api_calls_count,
          points = daily_api_usage.points + EXCLUDED.points, updated_at = now();
    `;

    await idb.none(query);
  }

  private static async recordMonthlyCounts(counts: ApiUsageCount[]) {
    const columns = new pgp.helpers.ColumnSet(
      ["api_key", "route", "api_calls_count", "status_code", "points", "month"],
      { table: "monthly_api_usage" }
    );

    const aggregatedCounts = new Map();

    _.map(counts, (count) => {
      const key = `${count.apiKey}*${count.route}*${format(
        new Date(count.date),
        "yyyy-MM-01 00:00:00"
      )}*${count.statusCode}`;

      if (aggregatedCounts.has(key)) {
        aggregatedCounts.get(key).api_calls_count += count.count;
        aggregatedCounts.get(key).points += count.points;
      } else {
        aggregatedCounts.set(key, {
          api_key: count.apiKey,
          route: count.route,
          api_calls_count: count.count,
          status_code: count.statusCode,
          points: count.points,
          month: format(new Date(count.date), "yyyy-MM-01 00:00:00"),
        });
      }
    });

    const values = Array.from(aggregatedCounts.values());

    const query = `
      INSERT INTO "monthly_api_usage" (
        "api_key",
        "route",
        "api_calls_count",
        "status_code",
        "points",
        "month"
      )
      VALUES ${pgp.helpers.values(values, columns)}
      ON CONFLICT ("month", "api_key", "route", "status_code") DO UPDATE
      SET api_calls_count = monthly_api_usage.api_calls_count + EXCLUDED.api_calls_count,
          points = monthly_api_usage.points + EXCLUDED.points, updated_at = now();
    `;

    await idb.none(query);
  }
}
