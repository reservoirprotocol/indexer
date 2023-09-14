import cron from "node-cron";

import { logger } from "@/common/logger";
import { acquireLock } from "@/common/redis";
import { config } from "@/config/index";
import { oneDayVolumeJob } from "@/jobs/daily-volumes/1day-volumes-job";
import { dailyVolumeJob } from "@/jobs/daily-volumes/daily-volumes-job";

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  cron.schedule("30 0 * * *", async () => {
    try {
      if (await acquireLock("daily-volumes-job-lock", 10)) {
        logger.info("calculate-daily-volumes", "Starting daily-volumes-lock");
        logger.info("daily-volumes", "Calculating daily volumes");

        try {
          await dailyVolumeJob.addToQueue();
        } catch (error) {
          logger.error("daily-volumes", `Failed to calculate daily volumes: ${error}`);
        }
      }
    } catch (error) {
      logger.error(
        "daily-volumes",
        JSON.stringify({
          msg: error,
        })
      );
    }
  });

  cron.schedule("*/15 * * * *", async () => {
    try {
      if (await acquireLock("1day-volumes-job-lock", 10)) {
        logger.info("calculate-1day-volumes", "Starting 1day-volumes-lock");
        logger.info("1day-volumes", "Calculating 1day volumes");

        try {
          await oneDayVolumeJob.addToQueue();
        } catch (error) {
          logger.error("daily-volumes", `Failed to calculate 1day volumes: ${error}`);
        }
      }
    } catch (error) {
      logger.error(
        "1day-volumes",
        JSON.stringify({
          msg: error,
        })
      );
    }
  });
}
