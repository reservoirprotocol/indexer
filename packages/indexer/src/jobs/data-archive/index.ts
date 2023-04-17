import { config } from "@/config/index";

import * as processArchiveData from "@/jobs/data-archive/process-archive-data";

import cron from "node-cron";
import { redlock } from "@/common/redis";

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  // Schedule cron to archive bid events table
  cron.schedule(
    "30 0 * * *",
    async () =>
      await redlock
        .acquire([`data-archive-cron-lock`], (5 * 60 - 5) * 1000)
        .then(async () => {
          await processArchiveData.addToQueue("bid_events");
        })
        .catch(() => {
          // Skip on any errors
        })
  );
}
