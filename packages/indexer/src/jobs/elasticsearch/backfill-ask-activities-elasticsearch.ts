/* eslint-disable @typescript-eslint/no-explicit-any */

import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { ridb } from "@/common/db";
import { config } from "@/config/index";

import * as ActivitiesIndex from "@/elasticsearch/indexes/activities";
import { AskCreatedEventHandler } from "@/elasticsearch/indexes/activities/event-handlers/ask-created";

const QUEUE_NAME = "backfill-ask-activities-elasticsearch";

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
      job.data.addToQueue = false;

      const cursor = job.data.cursor as CursorInfo;
      const fromTimestamp = job.data.fromTimestamp || 0;
      const toTimestamp = job.data.toTimestamp || 9999999999;
      const timestampFilterField = job.data.timestampFilterField;
      const orderId = job.data.orderId;

      const limit = Number((await redis.get(`${QUEUE_NAME}-limit`)) || 500);

      try {
        let continuationFilter = "";

        if (cursor) {
          continuationFilter = `AND (updated_at, id) > (to_timestamp($/updatedAt/), $/id/)`;
        }

        const timestampFilter = `AND ($/timestampFilterField:name/ >= to_timestamp($/fromTimestamp/) AND $/timestampFilterField:name/ < to_timestamp($/toTimestamp/))`;
        const orderFilter = orderId ? `AND orderId = $/orderId/` : "";

        const query = `
            ${AskCreatedEventHandler.buildBaseQuery()}
            WHERE side = 'sell'
            ${timestampFilter}
            ${orderFilter}
            ${continuationFilter}
            ORDER BY updated_at, id
            LIMIT $/limit/;
          `;

        const results = await ridb.manyOrNone(query, {
          id: cursor?.id,
          updatedAt: cursor?.updatedAt,
          fromTimestamp,
          toTimestamp,
          timestampFilterField,
          orderId,
          limit,
        });

        if (results.length) {
          const activities = [];

          for (const result of results) {
            const eventHandler = new AskCreatedEventHandler(
              result.order_id,
              result.event_tx_hash,
              result.event_log_index,
              result.event_batch_index
            );

            const activity = eventHandler.buildDocument(result);

            activities.push(activity);
          }

          await ActivitiesIndex.save(activities);

          const lastResult = results[results.length - 1];

          logger.debug(
            QUEUE_NAME,
            `Processed ${results.length} activities. cursor=${JSON.stringify(
              cursor
            )}, fromTimestamp=${fromTimestamp}, toTimestamp=${toTimestamp}, lastTimestamp=${
              lastResult.updated_ts
            }`
          );

          job.data.addToQueue = true;
          job.data.addToQueueCursor = {
            updatedAt: lastResult.updated_ts,
            id: lastResult.order_id,
          };
        } else {
          logger.debug(
            QUEUE_NAME,
            `No results. cursor=${JSON.stringify(
              cursor
            )}, fromTimestamp=${fromTimestamp}, toTimestamp=${toTimestamp}`
          );
        }
      } catch (error) {
        logger.error(
          QUEUE_NAME,
          `Process error. limit=${limit}, cursor=${JSON.stringify(cursor)}, error=${JSON.stringify(
            error
          )}`
        );
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("completed", async (job) => {
    if (job.data.addToQueue) {
      await addToQueue(job.data.addToQueueCursor, job.data.fromTimestamp, job.data.toTimestamp);
    }
  });

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (
  cursor?: CursorInfo,
  fromTimestamp?: number,
  toTimestamp?: number,
  timestampFilterField = "updated_at",
  orderId?: string
) => {
  await queue.add(randomUUID(), {
    cursor,
    fromTimestamp,
    toTimestamp,
    timestampFilterField,
    orderId,
  });
};

export interface CursorInfo {
  updatedAt: string;
  id: string;
}
