/* eslint-disable @typescript-eslint/no-explicit-any */

import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { logger } from "@/common/logger";
import { redis, redlock } from "@/common/redis";
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
      const cursor = job.data.cursor as CursorInfo;

      const fromTimestamp = job.data.fromTimestamp || 0;
      const toTimestamp = job.data.toTimestamp || 9999999999;

      const limit = Number((await redis.get(`${QUEUE_NAME}-limit`)) || 1);

      try {
        let continuationFilter = "";

        if (cursor) {
          continuationFilter = `AND (updated_at, id) > (to_timestamp($/updatedAt/), $/id/)`;
        }

        const query = `
            ${AskCreatedEventHandler.buildBaseQuery()}
            WHERE side = 'sell'
            AND (updated_at >= to_timestamp($/fromTimestamp/) AND updated_at < to_timestamp($/toTimestamp/)) 
            ${continuationFilter}
            ORDER BY updated_at, id
            LIMIT $/limit/;
          `;

        const results = await ridb.manyOrNone(query, {
          id: cursor?.id,
          updatedAt: cursor?.updatedAt,
          fromTimestamp,
          toTimestamp,
          limit,
        });

        if (results.length) {
          const activities = [];

          for (const result of results) {
            const eventHandler = new AskCreatedEventHandler(
              result.event_tx_hash,
              result.event_log_index,
              result.event_batch_index
            );
            const activity = eventHandler.buildDocument(result);

            activities.push(activity);
          }

          await ActivitiesIndex.save(activities);

          const lastResult = results[results.length - 1];

          logger.info(
            QUEUE_NAME,
            `Processed ${results.length} activities. fromTimestamp=${fromTimestamp}, toTimestamp=${toTimestamp}, lastTimestamp=${lastResult.event_timestamp}`
          );

          await addToQueue(
            {
              updatedAt: lastResult.updated_ts,
              id: lastResult.order_id,
            },
            fromTimestamp,
            toTimestamp
          );
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
    .acquire([`${QUEUE_NAME}-lock-v13`], 60 * 60 * 24 * 30 * 1000)
    .then(async () => {
      await addToQueue(undefined, undefined, 1609459199);
      await addToQueue(undefined, 1609459200, 1640995199);
      await addToQueue(undefined, 1640995200, 1672531199);
      await addToQueue(undefined, 1672531200);
    })
    .catch(() => {
      // Skip on any errors
    });
}

export const addToQueue = async (
  cursor?: CursorInfo,
  fromTimestamp?: number,
  toTimestamp?: number
) => {
  await queue.add(randomUUID(), { cursor, fromTimestamp, toTimestamp });
};

export interface CursorInfo {
  updatedAt: string;
  id: string;
}
