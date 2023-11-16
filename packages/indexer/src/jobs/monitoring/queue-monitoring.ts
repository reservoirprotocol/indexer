import cron from "node-cron";

import { config } from "@/config/index";
import { logger } from "@/common/logger";
import { redlock } from "@/common/redis";

import { PendingRefreshTokens } from "@/models/pending-refresh-tokens";
import { PendingActivitiesQueue } from "@/elasticsearch/indexes/activities/pending-activities-queue";
import { PendingActivityEventsQueue } from "@/elasticsearch/indexes/activities/pending-activity-events-queue";
import { EventKind } from "@/jobs/activities/process-activity-event-job";
import { PendingExpiredBidActivitiesQueue } from "@/elasticsearch/indexes/activities/pending-expired-bid-activities-queue";
import { PendingFlagStatusSyncTokens } from "@/models/pending-flag-status-sync-tokens";
import { PendingFlagStatusSyncContracts } from "@/models/pending-flag-status-sync-contracts";
import { PendingFlagStatusSyncCollectionSlugs } from "@/models/pending-flag-status-sync-collection-slugs";
import { PendingAskEventsQueue } from "@/elasticsearch/indexes/asks/pending-ask-events-queue";
import { PendingCollectionEventsQueue } from "@/elasticsearch/indexes/collections/pending-collection-events-queue";

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

          const pendingActivitiesQueue = new PendingActivitiesQueue();
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

          const pendingExpiredBidActivitiesQueue = new PendingExpiredBidActivitiesQueue();
          const pendingExpiredBidActivitiesQueueCount =
            await pendingExpiredBidActivitiesQueue.count();

          logger.info(
            "pending-expired-bid-activities-queue-metric",
            JSON.stringify({
              topic: "queue-monitoring",
              pendingExpiredBidActivitiesQueueCount,
            })
          );

          const pendingFlagStatusSyncCollectionSlugsCount =
            await PendingFlagStatusSyncCollectionSlugs.count();

          logger.info(
            "pending-flag-status-sync-collections-queue-metric",
            JSON.stringify({
              topic: "queue-monitoring",
              pendingFlagStatusSyncCollectionSlugsCount,
            })
          );

          const pendingFlagStatusSyncContractsCount = await PendingFlagStatusSyncContracts.count();

          logger.info(
            "pending-flag-status-sync-contracts-queue-metric",
            JSON.stringify({
              topic: "queue-monitoring",
              pendingFlagStatusSyncContractsCount,
            })
          );

          const pendingFlagStatusSyncTokensCount = await PendingFlagStatusSyncTokens.count();

          logger.info(
            "pending-flag-status-sync-tokens-queue-metric",
            JSON.stringify({
              topic: "queue-monitoring",
              pendingFlagStatusSyncTokensCount,
            })
          );

          const pendingAskEventsQueue = new PendingAskEventsQueue();

          const pendingAskEventsQueueCount = await pendingAskEventsQueue.count();

          logger.info(
            "pending-ask-events-metric",
            JSON.stringify({
              topic: "queue-monitoring",
              pendingAskEventsQueueCount,
            })
          );

          const pendingCollectionEventsQueue = new PendingCollectionEventsQueue();

          const pendingCollectionEventsCount = await pendingCollectionEventsQueue.count();

          logger.info(
            "pending-collection-events-metric",
            JSON.stringify({
              topic: "queue-monitoring",
              pendingCollectionEventsCount,
            })
          );
        })
        .catch(() => {
          // Skip on any errors
        })
  );
}
