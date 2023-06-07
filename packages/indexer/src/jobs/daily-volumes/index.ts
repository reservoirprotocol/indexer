import cron from "node-cron";

import { logger } from "@/common/logger";
import { redlock } from "@/common/redis";
import { config } from "@/config/index";
import { oneDayVolumeJob } from "@/jobs/daily-volumes/1day-volumes-job";
import { dailyVolumeJob } from "@/jobs/daily-volumes/daily-volumes-job";

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  cron.schedule(
    "30 0 * * *",
    async () =>
      await redlock
        .acquire(["daily-volumes-job-lock"], 5000)
        .then(async () => {
          logger.info("calculate-daily-volumes", "Starting daily-volumes-lock");
          logger.info("daily-volumes", "Calculating daily volumes");

          try {
            await dailyVolumeJob.addToQueue();
          } catch (error) {
            logger.error("daily-volumes", `Failed to calculate daily volumes: ${error}`);
          }
        })
        .catch((e) => {
          logger.error(
            "daily-volumes",
            JSON.stringify({
              msg: e.message,
            })
          );
        })
  );

  cron.schedule(
    "*/15 * * * *",
    async () =>
      await redlock
        .acquire(["1day-volumes-job-lock"], 5000)
        .then(async () => {
          logger.info("calculate-1day-volumes", "Starting 1day-volumes-lock");
          logger.info("1day-volumes", "Calculating 1day volumes");

          try {
            await oneDayVolumeJob.addToQueue();
          } catch (error) {
            logger.error("daily-volumes", `Failed to calculate 1day volumes: ${error}`);
          }
        })
        .catch((e) => {
          logger.error(
            "1day-volumes",
            JSON.stringify({
              msg: e.message,
            })
          );
        })
  );
}
