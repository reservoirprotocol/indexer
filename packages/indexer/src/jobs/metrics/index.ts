import cron from "node-cron";
import { acquireLock } from "@/common/redis";
import { config } from "@/config/index";
import { ApiUsageCounter } from "@/models/api-usage-counter";
import { ApiUsage } from "@/models/api-usage";
import { logger } from "@/common/logger";
import _ from "lodash";

if (config.doBackgroundWork) {
  // Every minute store metrics to long term DB
  cron.schedule("*/5 * * * *", async () => {
    try {
      const lock = await acquireLock("record-metrics", 60 * 5 - 5);
      if (lock) {
        const count = 200;
        let counts = [];
        do {
          counts = await ApiUsageCounter.popCounts(count);

          if (!_.isEmpty(counts)) {
            await ApiUsage.recordCounts(counts);
          }
        } while (counts.length === count);
      }
    } catch (error) {
      logger.error("record-metrics", `failed to record metrics error ${error}`);
    }
  });

  // Once a day clear old hourly and old daily records in order to keep the tables lean as possible
  cron.schedule("0 0 * * *", async () => {
    try {
      const lock = await acquireLock("clear-metrics", 60 * 5 - 5);
      if (lock) {
        await ApiUsage.clearOldHourlyCounts();
        await ApiUsage.clearOldDailyCounts();
      }
    } catch (error) {
      logger.error("clear-metrics", `failed to clear metrics error ${error}`);
    }
  });
}
