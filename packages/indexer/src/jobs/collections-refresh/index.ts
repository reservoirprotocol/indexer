import cron from "node-cron";

import { logger } from "@/common/logger";
import { acquireLock } from "@/common/redis";
import { config } from "@/config/index";
import { getNetworkSettings } from "@/config/network";
import { collectionRefreshJob } from "@/jobs/collections-refresh/collections-refresh-job";
import { collectionRefreshSpamJob } from "@/jobs/collections-refresh/collections-refresh-spam-job";

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork && getNetworkSettings().enableMetadataAutoRefresh) {
  cron.schedule("0 23 * * *", async () => {
    try {
      if (await acquireLock("daily-collections-metadata-refresh", 10)) {
        logger.info("daily-collections-refresh", "Starting refresh collections metadata");

        try {
          await collectionRefreshJob.addToQueue();
          await collectionRefreshSpamJob.addToQueue();
        } catch (error) {
          logger.error("daily-collections-refresh", `Failed to refresh: ${error}`);
        }
      }
    } catch (error) {
      logger.error(
        "daily-collections-refresh",
        JSON.stringify({
          msg: error,
        })
      );
    }
  });
}
