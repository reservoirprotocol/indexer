import cron from "node-cron";

import { logger } from "@/common/logger";
import { redlock } from "@/common/redis";
import { config } from "@/config/index";
import { getNetworkSettings } from "@/config/network";
import { collectionRefreshJob } from "@/jobs/collections-refresh/collections-refresh-job";

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork && getNetworkSettings().enableMetadataAutoRefresh) {
  cron.schedule(
    "30 23 * * *",
    async () =>
      await redlock
        .acquire(["daily-collections-metadata-refresh"], 5000)
        .then(async () => {
          logger.info("daily-collections-refresh", "Starting refresh collections metadata");

          try {
            await collectionRefreshJob.addToQueue();
          } catch (error) {
            logger.error("daily-collections-refresh", `Failed to refresh: ${error}`);
          }
        })
        .catch((e) => {
          logger.error(
            "daily-collections-refresh",
            JSON.stringify({
              msg: e.message,
            })
          );
        })
  );
}
