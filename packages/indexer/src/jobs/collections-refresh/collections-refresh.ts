/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";
import { Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";

import * as collectionUpdatesMetadata from "@/jobs/collection-updates/metadata-queue";
import { sub, set, getUnixTime, add } from "date-fns";
import { Collections } from "@/models/collections";
import { CollectionsEntity } from "@/models/collections/collections-entity";

const QUEUE_NAME = "collections-refresh-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    removeOnComplete: 1000,
    removeOnFail: 1000,
    timeout: 120000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async () => {
      let collections: CollectionsEntity[] = [];

      // Get all collections minted 24 hours ago
      const yesterday = sub(new Date(), {
        days: 1,
      });

      const yesterdayStart = getUnixTime(set(yesterday, { hours: 0, minutes: 0, seconds: 0 }));
      const yesterdayEnd = getUnixTime(set(new Date(), { hours: 0, minutes: 0, seconds: 0 }));
      collections = collections.concat(
        await Collections.getCollectionsMintedBetween(yesterdayStart, yesterdayEnd)
      );

      // Get all collections minted 7 days ago
      const oneWeekAgo = sub(new Date(), {
        days: 7,
      });

      const oneWeekAgoStart = getUnixTime(set(oneWeekAgo, { hours: 0, minutes: 0, seconds: 0 }));
      const oneWeekAgoEnd = getUnixTime(
        set(add(oneWeekAgo, { days: 1 }), { hours: 0, minutes: 0, seconds: 0 })
      );

      collections = collections.concat(
        await Collections.getCollectionsMintedBetween(oneWeekAgoStart, oneWeekAgoEnd)
      );

      // Get top collections by volume
      collections = collections.concat(await Collections.getTopCollectionsByVolume());

      const contracts = _.map(collections, (collection) => ({
        contract: collection.contract,
        community: collection.community,
      }));
      await collectionUpdatesMetadata.addToQueue(contracts);
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
