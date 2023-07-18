import cron from "node-cron";
import { config } from "@/config/index";
import { logger } from "@/common/logger";
import { PendingRefreshTokens } from "@/models/pending-refresh-tokens";
import { eventsSyncProcessRealtimeJob } from "@/jobs/events-sync/process/events-sync-process-realtime";
import { RabbitMq } from "@/common/rabbit-mq";
import { eventsSyncRealtimeJob } from "@/jobs/events-sync/events-sync-realtime-job";
import { openseaBidsQueueJob } from "@/jobs/orderbook/opensea-bids-queue-job";

if (config.doBackgroundWork) {
  cron.schedule("* * * * *", async () => {
    // Log metadata queue length
    for (const method of ["opensea"]) {
      const pendingRefreshTokens = new PendingRefreshTokens(method);
      const queueLength = await pendingRefreshTokens.length();
      logger.info("metadata-queue-length", JSON.stringify({ method, queueLength }));
    }

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
  });
}
