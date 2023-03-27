import cron from "node-cron";
import { redlock } from "@/common/redis";
import { config } from "@/config/index";
import { ApiUsageCounter } from "@/models/api-usage-counter";
import { ApiUsage } from "@/models/api-usage";

if (config.doBackgroundWork) {
  // Every minute store metrics to long term DB
  cron.schedule(
    "*/5 * * * *",
    async () =>
      await redlock
        .acquire(["record-metrics"], (60 * 5 - 5) * 1000)
        .then(async () => {
          const count = 200;
          let counts = [];
          do {
            counts = await ApiUsageCounter.popCounts(count);

            if (counts) {
              await ApiUsage.recordCounts(counts);
            }
          } while (counts.length === count);
        })
        .catch(() => {
          // Skip on any errors
        })
  );

  // Once a day clear old hourly and old daily records in order to keep the tables lean as possible
  cron.schedule(
    "0 0 * * *",
    async () =>
      await redlock
        .acquire(["clear-metrics"], (60 * 5 - 5) * 1000)
        .then(async () => {
          await ApiUsage.clearOldHourlyCounts();
          await ApiUsage.clearOldDailyCounts();
        })
        .catch(() => {
          // Skip on any errors
        })
  );
}
