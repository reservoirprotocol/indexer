import cron from "node-cron";

import { logger } from "@/common/logger";
import { acquireLock } from "@/common/redis";
import { config } from "@/config/index";
import { topSellingCollectionsJob } from "@/jobs/top-selling-collections-cache/save-top-selling-collections-job";

// Function to run the job
async function runJob() {
  try {
    if (await acquireLock("top-selling-collections", 20)) {
      logger.info("top-selling-collections", "Starting top selling collections job");

      try {
        await topSellingCollectionsJob.addToQueue();
      } catch (error) {
        logger.error("top-selling-collections", `Failed to save top selling collections: ${error}`);
      }
    }
  } catch (error) {
    logger.error(
      "top-selling-collections",
      JSON.stringify({
        msg: error,
      })
    );
  }
}

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  cron.schedule("*/10 * * * *", runJob);
}
