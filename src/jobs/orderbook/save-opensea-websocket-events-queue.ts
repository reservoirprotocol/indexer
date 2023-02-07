import { Queue, QueueScheduler, Worker } from "bullmq";

import { logger } from "@/common/logger";
import { redis, redlock } from "@/common/redis";
import { config } from "@/config/index";
import AWS from "aws-sdk";
import { OpenseaWebsocketEvents } from "@/models/opensea-websocket-events";
import cron from "node-cron";
import { randomUUID } from "crypto";

const QUEUE_NAME = "orderbook-save-opensea-websocket-events-queue";
const BATCH_LIMIT = 500;

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 10000,
    },
    removeOnComplete: 1000,
    removeOnFail: 10000,
    timeout: 30000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async () => {
      if (!config.openseaWebsocketEventsAwsFirehoseDeliveryStreamName) {
        return;
      }

      try {
        const openseaWebsocketEventsQueue = new OpenseaWebsocketEvents();
        const openseaWebsocketEvents = await openseaWebsocketEventsQueue.get(BATCH_LIMIT);

        if (!openseaWebsocketEvents.length) {
          logger.info(QUEUE_NAME, `No more events.`);
          return;
        }

        const params = {
          Records: openseaWebsocketEvents.map((event) => {
            /* eslint-disable @typescript-eslint/no-explicit-any */
            // TODO: Filter out the properties when ingesting from S3 to Redshift instead of here.
            delete (event.payload as any).item.metadata;
            delete (event.payload as any).item.permalink;

            return {
              Data: JSON.stringify({
                event_type: event.event_type,
                event_timestamp: new Date((event.payload as any).event_timestamp).toISOString(),
                order_hash: (event.payload as any).order_hash,
                maker: (event.payload as any).maker?.address,
                event_data: event,
                created_at: new Date().toISOString(),
              }),
            };
          }),
          DeliveryStreamName: config.openseaWebsocketEventsAwsFirehoseDeliveryStreamName,
        };

        logger.info(QUEUE_NAME, `Saving ${params.Records.length} events.`);

        const firehouse = new AWS.Firehose({
          accessKeyId: config.awsAccessKeyId,
          secretAccessKey: config.awsSecretAccessKey,
          region: config.openseaWebsocketEventsAwsFirehoseDeliveryStreamRegion,
        });

        await firehouse.putRecordBatch(params).promise();

        if (openseaWebsocketEvents.length >= BATCH_LIMIT) {
          await queue.add(randomUUID(), {});
        }
      } catch (error) {
        logger.error(QUEUE_NAME, `Failed to save events. error=${error}`);
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async () => {
  await queue.add(randomUUID(), {});
};

if (config.doWebsocketWork) {
  cron.schedule(
    "*/30 * * * * *",
    async () =>
      await redlock
        .acquire(["orderbook-save-opensea-websocket-events-queue-cron-lock"], (30 - 5) * 1000)
        .then(async () => addToQueue())
        .catch(() => {
          // Skip on any errors
        })
  );
}
