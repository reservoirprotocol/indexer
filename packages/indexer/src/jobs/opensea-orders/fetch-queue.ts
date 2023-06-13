/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { logger } from "@/common/logger";
import { redis, extendLock, releaseLock } from "@/common/redis";
import { config } from "@/config/index";
import { PendingRefreshOpenseaCollectionOffersCollections } from "@/models/pending-refresh-opensea-collection-offers-collections";
import axios from "axios";
import { getSupportedChainName } from "@/websockets/opensea/utils";
import { OpenseaOrderParams } from "@/orderbook/orders/seaport-v1.1";
import { parseProtocolData } from "@/websockets/opensea";
import * as orderbookOrders from "@/jobs/orderbook/orders-queue";
import { Tokens } from "@/models/tokens";
import { Collections } from "@/models/collections";
import * as collectionUpdatesMetadata from "@/jobs/collection-updates/metadata-queue";

const QUEUE_NAME = "opensea-orders-fetch-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    backoff: {
      type: "fixed",
      delay: 5000,
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
      let collectionOffers = [];
      let rateLimitExpiredIn = 0;

      job.data.addToQueue = false;

      const pendingRefreshOpenseaCollectionOffersCollections =
        new PendingRefreshOpenseaCollectionOffersCollections();
      const refreshOpenseaCollectionOffersCollections =
        await pendingRefreshOpenseaCollectionOffersCollections.get(1);

      // If no more tokens
      if (!_.isEmpty(refreshOpenseaCollectionOffersCollections)) {
        try {
          const fetchCollectionOffersResponse = await axios.get(
            `https://${
              config.chainId !== 5 ? "api" : "testnets-api"
            }.opensea.io/api/v2/offers/collection/${
              refreshOpenseaCollectionOffersCollections[0].slug
            }`,
            {
              headers:
                config.chainId !== 5
                  ? {
                      "Content-Type": "application/json",
                      "X-Api-Key": config.openSeaApiKey,
                    }
                  : {
                      "Content-Type": "application/json",
                    },
            }
          );

          collectionOffers = fetchCollectionOffersResponse.data.offers;
        } catch (error) {
          if ((error as any).response?.status === 429) {
            logger.info(QUEUE_NAME, `Throttled. error=${JSON.stringify(error)}`);

            rateLimitExpiredIn = 5;

            await pendingRefreshOpenseaCollectionOffersCollections.add(
              refreshOpenseaCollectionOffersCollections,
              true
            );
          } else if ((error as any).response?.status === 404) {
            logger.warn(
              QUEUE_NAME,
              `Collection Not Found. refreshOpenseaCollectionOffersCollections=${refreshOpenseaCollectionOffersCollections}, error=${JSON.stringify(
                error
              )}`
            );

            try {
              const tokenId = await Tokens.getSingleToken(
                refreshOpenseaCollectionOffersCollections[0].collection
              );
              const collectionResult = await Collections.getById(
                refreshOpenseaCollectionOffersCollections[0].collection
              );

              await collectionUpdatesMetadata.addToQueue(
                collectionResult!.contract,
                tokenId,
                collectionResult!.community,
                0,
                false,
                QUEUE_NAME
              );
            } catch {
              // Skip on any errors
            }
          } else {
            logger.error(
              QUEUE_NAME,
              `fetchCollectionOffers failed. error=${JSON.stringify(error)}`
            );
          }
        }
      }

      logger.info(
        QUEUE_NAME,
        `Success. refreshOpenseaCollectionOffersCollections=${JSON.stringify(
          refreshOpenseaCollectionOffersCollections
        )}, collectionOffersCount=${
          collectionOffers.length
        }, rateLimitExpiredIn=${rateLimitExpiredIn}`
      );

      for (const collectionOffer of collectionOffers) {
        if (getSupportedChainName() === collectionOffer.chain) {
          const openSeaOrderParams = {
            kind: "contract-wide",
            side: "buy",
            hash: collectionOffer.order_hash,
            contract: refreshOpenseaCollectionOffersCollections[0].contract,
            collectionSlug: refreshOpenseaCollectionOffersCollections[0].slug,
          } as OpenseaOrderParams;

          if (openSeaOrderParams) {
            const protocolData = parseProtocolData(collectionOffer);

            if (protocolData) {
              const orderInfo = {
                kind: protocolData.kind,
                info: {
                  orderParams: protocolData.order.params,
                  metadata: {
                    originatedAt: new Date(Date.now()).toISOString(),
                  },
                  isOpenSea: true,
                  openSeaOrderParams,
                },
                validateBidValue: true,
              } as any;

              await orderbookOrders.addToQueue([orderInfo]);
            }
          }
        }
      }

      // If there are potentially more collections to process trigger another job
      if (rateLimitExpiredIn || _.size(refreshOpenseaCollectionOffersCollections) == 1) {
        if (await extendLock(getLockName(), 60 * 5 + rateLimitExpiredIn)) {
          job.data.addToQueue = true;
          job.data.addToQueueDelay = rateLimitExpiredIn * 1000;
        }
      } else {
        await releaseLock(getLockName());
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });

  worker.on("completed", async (job) => {
    if (job.data.addToQueue) {
      await addToQueue(job.data.addToQueueDelay);
    }
  });
}

export const getLockName = () => {
  return `${QUEUE_NAME}`;
};

export const addToQueue = async (delay = 0) => {
  await queue.add(randomUUID(), {}, { delay });
};
