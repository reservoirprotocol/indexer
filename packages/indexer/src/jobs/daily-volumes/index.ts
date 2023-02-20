import cron from "node-cron";

import { logger } from "@/common/logger";
import { redlock } from "@/common/redis";
import { config } from "@/config/index";
import * as dailyVolumes from "@/jobs/daily-volumes/daily-volumes";

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
            await dailyVolumes.addToQueue();
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
}
