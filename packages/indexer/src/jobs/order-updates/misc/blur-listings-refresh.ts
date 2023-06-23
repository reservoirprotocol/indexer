import axios from "axios";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import * as orderbook from "@/jobs/orderbook/orders-queue";
import * as blurListingsRefresh from "@/jobs/order-updates/misc/blur-listings-refresh";
import { updateBlurRoyalties } from "@/utils/blur";

const QUEUE_NAME = "blur-listings-refresh";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 20,
    backoff: {
      type: "fixed",
      delay: 30000,
    },
    removeOnComplete: 0,
    removeOnFail: 10000,
    timeout: 10000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { collection } = job.data as { collection: string };

      try {
        // First fetch the most up-to-date state of the listings
        const blurListings = await axios
          .get(
            `${config.orderFetcherBaseUrl}/api/blur-collection-listings?collection=${collection}`
          )
          .then(
            (response) =>
              response.data.listings as {
                owner: string;
                contractAddress: string;
                tokenId: string;
                price: string;
                createdAt: string;
              }[]
          );

        logger.info(QUEUE_NAME, JSON.stringify(blurListings));

        // And add them to the queue (duplicates will simply be ignored)
        await orderbook.addToQueue(
          blurListings.map((l) => ({
            kind: "blur-listing",
            info: {
              orderParams: {
                collection,
                tokenId: l.tokenId,
                owner: l.owner,
                price: l.price,
                createdAt: l.createdAt,
              },
              metadata: {},
            },
          }))
        );

        const listingsMap: { [id: string]: boolean } = {};
        for (const l of blurListings) {
          const id = `${l.contractAddress}-${l.tokenId}-${l.price}-${l.createdAt}`;
          listingsMap[id] = true;
        }

        // Then fetch any own listings
        const ownListings = await idb.manyOrNone(
          `
            SELECT
              orders.raw_data
            FROM orders
            WHERE orders.contract = $/contract/
              AND orders.kind = 'blur'
              AND orders.side = 'sell'
              AND orders.fillability_status = 'fillable'
              AND orders.approval_status = 'approved'
              AND orders.raw_data->>'createdAt' IS NOT NULL
          `,
          {
            contract: toBuffer(collection),
          }
        );
        // And make sure to remove any listings that were not retireved via the previous call
        for (const l of ownListings) {
          const id = `${l.raw_data.collection}-${l.raw_data.tokenId}-${l.raw_data.price}-${l.raw_data.createdAt}`;
          if (!listingsMap[id]) {
            await orderbook.addToQueue([
              {
                kind: "blur-listing",
                info: {
                  orderParams: {
                    collection,
                    tokenId: l.raw_data.tokenId,
                    createdAt: l.raw_data.createdAt,
                  },
                  metadata: {},
                },
              },
            ]);
          }
        }

        // Also refresh the royalties
        const lockKey = `blur-royalties-refresh-lock:${collection}`;
        const lock = await redis.get(lockKey);
        if (!lock) {
          await redis.set(lockKey, "locked", "EX", 3600 - 5);
          await updateBlurRoyalties(collection);
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (error: any) {
        logger.error(
          QUEUE_NAME,
          `Failed to refresh Blur listings for collection ${collection}: ${
            error?.response?.data ? JSON.stringify(error.response.data) : error
          }`
        );
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (collection: string, force = false) => {
  if (force) {
    await queue.add(collection, { collection });
  } else {
    const delayInSeconds = 10 * 60;
    const halfDelayInSeconds = delayInSeconds / 2;

    // At most one job per collection per `delayInSeconds` seconds
    const lockKey = `blur-listings-refresh-lock:${collection}`;
    const lock = await redis.get(lockKey);
    if (!lock) {
      await redis.set(lockKey, "locked", "EX", delayInSeconds - 1);
      await queue.add(
        collection,
        { collection },
        {
          jobId: collection,
          // Each job is randomly delayed so as to avoid too many concurrent requests
          delay: Math.floor(halfDelayInSeconds + Math.random() * halfDelayInSeconds) * 1000,
        }
      );
    }
  }

  // Also refresh listings on the collection
  await blurListingsRefresh.addToQueue(collection, force);
};
