import _ from "lodash";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { logger } from "@/common/logger";
import { acquireLock, redis } from "@/common/redis";
import { config } from "@/config/index";

import { PendingRefreshOpenseaCollectionOffersCollections } from "@/models/pending-refresh-opensea-collection-offers-collections";
import * as openseaOrdersFetchQueue from "@/jobs/opensea-orders/fetch-queue";

export const QUEUE_NAME = "opensea-orders-process-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    backoff: {
      type: "exponential",
      delay: 20000,
    },
    removeOnComplete: 100,
    removeOnFail: 100,
    timeout: 60 * 1000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { kind, data } = job.data as PendingRefreshOpenseaCollectionOffersCollectionInfo;
      const prioritized = !_.isUndefined(job.opts.priority);

      if (kind === "collection-offers") {
        // Add the collections slugs to the list
        const pendingRefreshOpenseaCollectionOffersCollections =
          new PendingRefreshOpenseaCollectionOffersCollections();
        await pendingRefreshOpenseaCollectionOffersCollections.add(
          [
            {
              contract: data.contract,
              collection: data.collectionId,
              slug: data.collectionSlug,
            },
          ],
          prioritized
        );

        if (await acquireLock(openseaOrdersFetchQueue.getLockName(), 60 * 5)) {
          await openseaOrdersFetchQueue.addToQueue();
        }
      }
    },
    { connection: redis.duplicate(), concurrency: 5 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export type PendingRefreshOpenseaCollectionOffersCollectionInfo = {
  kind: "collection-offers";
  data: {
    contract: string;
    collectionId: string;
    collectionSlug: string;
  };
};

export const addToQueue = async (
  infos: PendingRefreshOpenseaCollectionOffersCollectionInfo[],
  prioritized = false,
  delayInSeconds = 0
) => {
  await queue.addBulk(
    infos.map((info) => ({
      name: randomUUID(),
      data: info,
      opts: {
        priority: prioritized ? 1 : undefined,
        delay: delayInSeconds * 1000,
      },
    }))
  );
};
