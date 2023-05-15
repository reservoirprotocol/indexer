/* eslint-disable @typescript-eslint/no-explicit-any */

import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { logger } from "@/common/logger";
import { redis, redlock } from "@/common/redis";

import { config } from "@/config/index";
import { ridb } from "@/common/db";
import { fromBuffer, toBuffer } from "@/common/utils";

import * as ActivitiesIndex from "@/elasticsearch/indexes/activities";
import { NftTransferEventCreatedEventHandler } from "@/elasticsearch/indexes/activities/event-handlers/nft-transfer-event-created";

const QUEUE_NAME = "backfill-transfer-activities-elasticsearch";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    removeOnComplete: 1000,
    removeOnFail: 10000,
  },
});

new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork && config.doElasticsearchWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const cursor = job.data.cursor as CursorInfo;

      const limit = Number((await redis.get(`${QUEUE_NAME}-limit`)) || 1);

      try {
        let continuationFilter = "";

        if (cursor) {
          continuationFilter = `AND (timestamp, tx_hash, log_index, batch_index) > ($/timestamp/, $/txHash/, $/logIndex/, $/batchIndex/)`;
        }

        const query = `
            ${NftTransferEventCreatedEventHandler.buildBaseQuery()}
            WHERE  NOT EXISTS (
             SELECT 1
             FROM   fill_events_2 fe
             WHERE  fe.tx_hash = nft_transfer_events.tx_hash
             AND    fe.log_index = nft_transfer_events.log_index
             AND    fe.batch_index = nft_transfer_events.batch_index
             )
            ${continuationFilter}
            ORDER BY timestamp, tx_hash, log_index, batch_index
            LIMIT $/limit/;  
          `;

        const results = await ridb.manyOrNone(query, {
          timestamp: cursor?.timestamp || null,
          txHash: cursor?.txHash ? toBuffer(cursor.txHash) : null,
          logIndex: cursor?.logIndex,
          batchIndex: cursor?.batchIndex,
          limit,
        });

        if (results.length) {
          const activities = [];

          for (const result of results) {
            const eventHandler = new NftTransferEventCreatedEventHandler(
              result.event_tx_hash,
              result.event_log_index,
              result.event_batch_index
            );
            const activity = eventHandler.buildDocument(result);

            activities.push(activity);
          }

          await ActivitiesIndex.save(activities);

          logger.info(QUEUE_NAME, `Processed ${results.length} activities.`);

          const lastResult = results[results.length - 1];

          await addToQueue({
            timestamp: lastResult.event_timestamp,
            txHash: fromBuffer(lastResult.event_tx_hash),
            logIndex: lastResult.event_log_index,
            batchIndex: lastResult.event_batch_index,
          });
        }
      } catch (error) {
        logger.error(
          QUEUE_NAME,
          `Process error.  limit=${limit}, cursor=${JSON.stringify(cursor)}, error=${JSON.stringify(
            error
          )}`
        );
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });

  redlock
    .acquire([`${QUEUE_NAME}-lock-v9`], 60 * 60 * 24 * 30 * 1000)
    .then(async () => {
      await addToQueue();
    })
    .catch(() => {
      // Skip on any errors
    });
}

export const addToQueue = async (cursor?: CursorInfo) => {
  await queue.add(randomUUID(), { cursor }, { delay: 1000 });
};

export interface CursorInfo {
  timestamp: string;
  txHash: string;
  logIndex: number;
  batchIndex: string;
}
