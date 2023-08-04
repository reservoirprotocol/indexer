import cron from "node-cron";
import { config } from "@/config/index";
import { logger } from "@/common/logger";
import { PendingRefreshTokens } from "@/models/pending-refresh-tokens";
import { eventsSyncProcessRealtimeJob } from "@/jobs/events-sync/process/events-sync-process-realtime";
import { RabbitMq } from "@/common/rabbit-mq";
import { eventsSyncRealtimeJob } from "@/jobs/events-sync/events-sync-realtime-job";
import { openseaBidsQueueJob } from "@/jobs/orderbook/opensea-bids-queue-job";
import { redlock } from "@/common/redis";

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
              metadataIndexingMethod: config.metadataIndexingMethod,
              pendingRefreshTokensCount,
            })
          );

          for (const queue of [
            eventsSyncProcessRealtimeJob,
            eventsSyncRealtimeJob,
            openseaBidsQueueJob,
          ]) {
            const queueSize = await RabbitMq.getQueueSize(queue.getQueue());
            const retryQueueSize = await RabbitMq.getQueueSize(queue.getRetryQueue());

            logger.info(
              "queue-monitoring",
              JSON.stringify({ queue: queue.queueName, jobCount: queueSize + retryQueueSize })
            );
          }
        })
        .catch(() => {
          // Skip on any errors
        })
  );
}
