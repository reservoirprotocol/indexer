import axios from "axios";
import cron from "node-cron";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis, redlock } from "@/common/redis";
import { toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { RabbitMqJobsConsumer } from "@/jobs/index";
import { orderbookOrdersJob } from "@/jobs/orderbook/orderbook-orders-job";
import { updateBlurRoyalties } from "@/utils/blur";

export type BlurListingsRefreshJobPayload = {
  collection: string;
};

export default class BlurListingsRefreshJob extends AbstractRabbitMqJobHandler {
  queueName = "blur-listings-refresh";
  maxRetries = 3;
  concurrency = 1;
  backoff = {
    type: "fixed",
    delay: 30000,
  } as BackoffStrategy;

  public async process(payload: BlurListingsRefreshJobPayload) {
    const { collection } = payload;

    if (config.chainId !== 1) {
      return;
    }

    try {
      // First fetch the most up-to-date state of the listings
      await axios
        .get(`${config.orderFetcherBaseUrl}/api/blur-collection-listings?collection=${collection}`)
        .then(async (response) => {
          const blurListings = response.data.listings as {
            owner: string;
            contractAddress: string;
            tokenId: string;
            price: string;
            createdAt: string;
          }[];

          // And add them to the queue (duplicates will simply be ignored)
          await orderbookOrdersJob.addToQueue(
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
              await orderbookOrdersJob.addToQueue([
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
        })
        .catch(() => {
          // Skip any errors
        });

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
        this.queueName,
        `Failed to refresh Blur listings for collection ${collection}: ${
          error?.response?.data ? JSON.stringify(error.response.data) : error
        }`
      );
      throw error;
    }
  }

  public async addToQueue(collection: string, force = false) {
    if (force) {
      await this.send({ payload: { collection } });
    } else {
      const delayInSeconds = 10 * 60;
      const halfDelayInSeconds = delayInSeconds / 2;

      await this.send(
        { payload: { collection }, jobId: collection },
        Math.floor(halfDelayInSeconds + Math.random() * halfDelayInSeconds) * 1000
      );
    }
  }
}

export const blurListingsRefreshJob = new BlurListingsRefreshJob();

if (config.doBackgroundWork) {
  cron.schedule(
    // Every hour
    "*/60 * * * *",
    async () =>
      await redlock
        .acquire(["blur-listings-refresh-retry-lock"], (60 * 60 - 3) * 1000)
        .then(async () => {
          await RabbitMqJobsConsumer.retryQueue(blurListingsRefreshJob.queueName);
        })
        .catch(() => {
          // Skip any errors
        })
  );
}
