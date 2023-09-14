import cron from "node-cron";

import { config } from "@/config/index";
import { redlock } from "@/common/redis";

import { PendingRefreshTokens } from "@/models/pending-refresh-tokens";
import { PendingActivitiesQueue } from "@/elasticsearch/indexes/activities/pending-activities-queue";
import { PendingActivityEventsQueue } from "@/elasticsearch/indexes/activities/pending-activity-events-queue";
import { EventKind } from "@/jobs/activities/process-activity-event-job";
import { submitMetric } from "@/common/tracer";

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

          submitMetric("pendingRefreshTokens", pendingRefreshTokensCount, {
            metadataIndexingMethod: config.metadataIndexingMethod,
          });

          const pendingActivitiesQueue = new PendingActivitiesQueue();
          const pendingActivitiesQueueCount = await pendingActivitiesQueue.count();

          submitMetric("pendingActivities", pendingActivitiesQueueCount);

          for (const eventKind of Object.values(EventKind)) {
            const pendingActivityEventsQueue = new PendingActivityEventsQueue(eventKind);
            const pendingActivityEventsQueueCount = await pendingActivityEventsQueue.count();

            submitMetric("pendingActivityEvents", pendingActivityEventsQueueCount, {
              eventKind,
            });
          }
        })
        .catch(() => {
          // Skip on any errors
        })
  );
}
