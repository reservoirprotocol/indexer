/* eslint-disable @typescript-eslint/no-explicit-any */

import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";

import { config } from "@/config/index";
import { ridb } from "@/common/db";

import * as backfillTransfers from "@/jobs/elasticsearch/backfill-transfer-activities-elasticsearch";
import * as backfillSales from "@/jobs/elasticsearch/backfill-sale-activities-elasticsearch";
import * as backfillAsks from "@/jobs/elasticsearch/backfill-ask-activities-elasticsearch";
import * as backfillAskCancels from "@/jobs/elasticsearch/backfill-ask-cancel-activities-elasticsearch";
import * as backfillBids from "@/jobs/elasticsearch/backfill-bid-activities-elasticsearch";
import * as backfillBidCancels from "@/jobs/elasticsearch/backfill-bid-cancel-activities-elasticsearch";
import * as ActivitiesIndex from "@/elasticsearch/indexes/activities";

const QUEUE_NAME = "backfill-activities-elasticsearch";

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
      logger.info(
        QUEUE_NAME,
        JSON.stringify({
          topic: "backfillTransferActivities",
          message: "Start",
          jobData: job.data,
        })
      );

      if (job.data.initIndex) {
        await ActivitiesIndex.initIndex();
      }

      const promises = [];

      const backfillTransferActivities = async () => {
        logger.info(
          QUEUE_NAME,
          JSON.stringify({
            topic: "backfillActivities",
            message: "Start",
          })
        );

        const query =
          "SELECT min(timestamp) AS min_timestamp, MAX(timestamp) AS max_timestamp from nft_transfer_events;";

        const timestamps = await ridb.oneOrNone(query);

        const start = new Date(timestamps.min_timestamp * 1000);
        const end = new Date(timestamps.max_timestamp * 1000);

        let loop = new Date(start);

        while (loop <= end) {
          const fromTimestamp = Math.floor(loop.getTime() / 1000);
          const newDate = loop.setDate(loop.getDate() + 1);
          const toTimestamp = Math.floor(newDate / 1000);

          await backfillTransfers.addToQueue(undefined, fromTimestamp, toTimestamp);

          loop = new Date(newDate);
        }

        logger.info(
          QUEUE_NAME,
          JSON.stringify({
            topic: "backfillTransferActivities",
            start: start.toISOString(),
            end: end.toISOString(),
          })
        );
      };

      const backfillSaleActivities = async () => {
        const query =
          "SELECT min(timestamp) AS min_timestamp, MAX(timestamp) AS max_timestamp from fill_events_2;";

        const timestamps = await ridb.oneOrNone(query);

        const start = new Date(timestamps.min_timestamp * 1000);
        const end = new Date(timestamps.max_timestamp * 1000);

        let loop = new Date(start);

        while (loop <= end) {
          const fromTimestamp = Math.floor(loop.getTime() / 1000);
          const newDate = loop.setDate(loop.getDate() + 1);
          const toTimestamp = Math.floor(newDate / 1000);

          await backfillSales.addToQueue(undefined, fromTimestamp, toTimestamp);

          loop = new Date(newDate);
        }

        logger.info(
          QUEUE_NAME,
          JSON.stringify({
            topic: "backfillSaleActivities",
            start: start.toISOString(),
            end: end.toISOString(),
          })
        );
      };

      const backfillAskActivities = async () => {
        const query =
          "SELECT extract(epoch from min(updated_at)) AS min_timestamp, extract(epoch from max(updated_at)) AS max_timestamp from orders WHERE side = 'sell';";

        const timestamps = await ridb.oneOrNone(query);

        const start = new Date(timestamps.min_timestamp * 1000);
        const end = new Date(timestamps.max_timestamp * 1000);

        let loop = new Date(start);

        while (loop <= end) {
          const fromTimestamp = Math.floor(loop.getTime() / 1000);
          const newDate = loop.setDate(loop.getDate() + 1);
          const toTimestamp = Math.floor(newDate / 1000);

          await backfillAsks.addToQueue(undefined, fromTimestamp, toTimestamp);

          loop = new Date(newDate);
        }

        logger.info(
          QUEUE_NAME,
          JSON.stringify({
            topic: "backfillAskActivities",
            start: start.toISOString(),
            end: end.toISOString(),
          })
        );
      };

      const backfillAskCancelActivities = async () => {
        const query =
          "SELECT extract(epoch from min(updated_at)) AS min_timestamp, extract(epoch from max(updated_at)) AS max_timestamp from orders WHERE side = 'sell' AND fillability_status = 'cancelled';";

        const timestamps = await ridb.oneOrNone(query);

        const start = new Date(timestamps.min_timestamp * 1000);
        const end = new Date(timestamps.max_timestamp * 1000);

        let loop = new Date(start);

        while (loop <= end) {
          const fromTimestamp = Math.floor(loop.getTime() / 1000);
          const newDate = loop.setDate(loop.getDate() + 1);
          const toTimestamp = Math.floor(newDate / 1000);

          await backfillAskCancels.addToQueue(undefined, fromTimestamp, toTimestamp);

          loop = new Date(newDate);
        }

        logger.info(
          QUEUE_NAME,
          JSON.stringify({
            topic: "backfillAskCancelActivities",
            start: start.toISOString(),
            end: end.toISOString(),
          })
        );
      };

      const backfillBidActivities = async () => {
        const query =
          "SELECT extract(epoch from min(updated_at)) AS min_timestamp, extract(epoch from max(updated_at)) AS max_timestamp from orders WHERE side = 'buy';";

        const timestamps = await ridb.oneOrNone(query);

        const start = new Date(timestamps.min_timestamp * 1000);
        const end = new Date(timestamps.max_timestamp * 1000);

        let loop = new Date(start);

        while (loop <= end) {
          const fromTimestamp = Math.floor(loop.getTime() / 1000);
          const newDate = loop.setDate(loop.getDate() + 1);
          const toTimestamp = Math.floor(newDate / 1000);

          await backfillBids.addToQueue(undefined, fromTimestamp, toTimestamp);

          loop = new Date(newDate);
        }

        logger.info(
          QUEUE_NAME,
          JSON.stringify({
            topic: "backfillBidActivities",
            start: start.toISOString(),
            end: end.toISOString(),
          })
        );
      };

      const backfillBidCancelActivities = async () => {
        const query =
          "SELECT extract(epoch from min(updated_at)) AS min_timestamp, extract(epoch from max(updated_at)) AS max_timestamp from orders WHERE side = 'buy' AND fillability_status = 'cancelled';";

        const timestamps = await ridb.oneOrNone(query);

        const start = new Date(timestamps.min_timestamp * 1000);
        const end = new Date(timestamps.max_timestamp * 1000);

        let loop = new Date(start);

        while (loop <= end) {
          const fromTimestamp = Math.floor(loop.getTime() / 1000);
          const newDate = loop.setDate(loop.getDate() + 1);
          const toTimestamp = Math.floor(newDate / 1000);

          await backfillBidCancels.addToQueue(undefined, fromTimestamp, toTimestamp);

          loop = new Date(newDate);
        }

        logger.info(
          QUEUE_NAME,
          JSON.stringify({
            topic: "backfillBidCancelActivities",
            start: start.toISOString(),
            end: end.toISOString(),
          })
        );
      };

      if (job.data.backfillTransferActivities) {
        promises.push(backfillTransferActivities());
      }

      if (job.data.backfillSaleActivities) {
        promises.push(backfillSaleActivities());
      }

      if (job.data.backfillTransferActivities) {
        promises.push(backfillTransferActivities());
      }

      if (job.data.backfillAskActivities) {
        promises.push(backfillAskActivities());
      }

      if (job.data.backfillAskCancelActivities) {
        promises.push(backfillAskCancelActivities());
      }

      if (job.data.backfillBidActivities) {
        promises.push(backfillBidActivities());
      }

      if (job.data.backfillBidCancelActivities) {
        promises.push(backfillBidCancelActivities());
      }

      await Promise.all(promises);
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (
  initIndex = false,
  backfillTransferActivities = true,
  backfillSaleActivities = true,
  backfillAskActivities = true,
  backfillAskCancelActivities = true,
  backfillBidActivities = true,
  backfillBidCancelActivities = true
) => {
  await queue.add(randomUUID(), {
    initIndex,
    backfillTransferActivities,
    backfillSaleActivities,
    backfillAskActivities,
    backfillAskCancelActivities,
    backfillBidActivities,
    backfillBidCancelActivities,
  });
};
