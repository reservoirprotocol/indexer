import cron from "node-cron";
import { config } from "@/config/index";
import { logger } from "@/common/logger";
import { PendingRefreshTokens } from "@/models/pending-refresh-tokens";
import { queue as eventsSyncRealtimeQueue } from "@/jobs/events-sync/realtime-queue";
import { eventsSyncProcessRealtimeJob } from "@/jobs/events-sync/process/events-sync-process-realtime";
import { RabbitMq } from "@/common/rabbit-mq";

if (config.doBackgroundWork) {
  cron.schedule("*/5 * * * *", async () => {
    // Log metadata queue length
    for (const method of ["opensea"]) {
      const pendingRefreshTokens = new PendingRefreshTokens(method);
      const queueLength = await pendingRefreshTokens.length();
      logger.info("metadata-queue-length", JSON.stringify({ method, queueLength }));
    }

    // Log queue job counts per status
    for (const queue of [eventsSyncRealtimeQueue]) {
      const jobCount = await queue.getJobCounts(
        "wait",
        "active",
        "delayed",
        "completed",
        "failed",
        "paused",
        "repeat"
      );

      logger.info("queue-monitoring", JSON.stringify({ queue: queue.name, jobCount }));
    }

    for (const queue of [eventsSyncProcessRealtimeJob]) {
      const queueSize = await RabbitMq.getQueueSize(queue.getQueue());
      const retryQueueSize = await RabbitMq.getQueueSize(queue.getRetryQueue());

      logger.info(
        "queue-monitoring",
        JSON.stringify({ queue: queue.queueName, jobCount: queueSize + retryQueueSize })
      );
    }
  });
}
