import { config } from "@/config/index";

import cron from "node-cron";
import { redlock } from "@/common/redis";
import { processArchiveDataJob } from "@/jobs/data-archive/process-archive-data-job";

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  // Schedule cron to archive bid events table
  cron.schedule(
    "*/10 * * * *",
    async () =>
      await redlock
        .acquire([`data-archive-cron-lock`], (10 * 60 - 5) * 1000)
        .then(async () => {
          await processArchiveDataJob.addToQueue({ tableName: "bid_events" });
          await processArchiveDataJob.addToQueue({ tableName: "orders", type: "bids" });
        })
        .catch(() => {
          // Skip on any errors
        })
  );
}
