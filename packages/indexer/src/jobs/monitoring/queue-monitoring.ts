import cron from "node-cron";

import { config } from "@/config/index";
import { redlock } from "@/common/redis";

import { PendingRefreshTokens } from "@/models/pending-refresh-tokens";
import { PendingActivitiesQueue } from "@/elasticsearch/indexes/activities/pending-activities-queue";
import { PendingActivityEventsQueue } from "@/elasticsearch/indexes/activities/pending-activity-events-queue";
import { EventKind } from "@/jobs/activities/process-activity-event-job";
import { metric } from "@/common/metric";

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

          metric.distribution({
            name: "pendingRefreshTokens",
            value: pendingRefreshTokensCount,
            tags: {
              metadataIndexingMethod: config.metadataIndexingMethod,
            },
          });

          const pendingActivitiesQueue = new PendingActivitiesQueue();
          const pendingActivitiesQueueCount = await pendingActivitiesQueue.count();

          metric.distribution({
            name: "pendingActivities",
            value: pendingActivitiesQueueCount,
          });

          for (const eventKind of Object.values(EventKind)) {
            const pendingActivityEventsQueue = new PendingActivityEventsQueue(eventKind);
            const pendingActivityEventsQueueCount = await pendingActivityEventsQueue.count();

            metric.distribution({
              name: "pendingActivityEvents",
              value: pendingActivityEventsQueueCount,
              tags: {
                eventKind,
              },
            });
          }
        })
        .catch(() => {
          // Skip on any errors
        })
  );
}
