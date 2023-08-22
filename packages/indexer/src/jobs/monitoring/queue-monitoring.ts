import cron from "node-cron";

import { config } from "@/config/index";
import { logger } from "@/common/logger";
import { redlock } from "@/common/redis";

import { PendingRefreshTokens } from "@/models/pending-refresh-tokens";
import { PendingActivitiesQueue } from "@/elasticsearch/indexes/activities/pending-activities-queue";
import { PendingActivityEventsQueue } from "@/elasticsearch/indexes/activities/pending-activity-events-queue";
import { EventKind } from "@/jobs/activities/process-activity-event-job";

if (config.doBackgroundWork) {
  cron.schedule(
    "* * * * *",
    async () =>
      await redlock
        .acquire([`queue-monitoring-cron-lock`], (60 - 5) * 1000)
        .then(async () => {
          // Log token metadata queue length
          const pendingRefreshTokens = new PendingRefreshTokens(config.metadataIndexingMethod);
          const pendingRefreshTokensCount = await pendingRefreshTokens.length();

          logger.info(
            "pending-refresh-tokens-metric",
            JSON.stringify({
              topic: "queue-monitoring",
              metadataIndexingMethod: config.metadataIndexingMethod,
              pendingRefreshTokensCount,
            })
          );

          const pendingActivitiesQueue = new PendingActivitiesQueue(config.metadataIndexingMethod);
          const pendingActivitiesQueueCount = await pendingActivitiesQueue.count();

          logger.info(
            "pending-activities-queue-metric",
            JSON.stringify({
              topic: "queue-monitoring",
              pendingActivitiesQueueCount,
            })
          );

          for (const eventKind of Object.values(EventKind)) {
            const pendingActivityEventsQueue = new PendingActivityEventsQueue(eventKind);
            const pendingActivityEventsQueueCount = await pendingActivityEventsQueue.count();

            logger.info(
              "pending-activity-events-queue-metric",
              JSON.stringify({
                topic: "queue-monitoring",
                eventKind,
                pendingActivityEventsQueueCount,
              })
            );
          }
        })
        .catch(() => {
          // Skip on any errors
        })
  );
}
