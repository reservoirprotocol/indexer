/* eslint-disable @typescript-eslint/no-explicit-any */

import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import _ from "lodash";
import { PendingRefreshOpenseaCollectionOffersCollections } from "@/models/pending-refresh-opensea-collection-offers-collections";
import { extendLock, releaseLock } from "@/common/redis";
import axios from "axios";
import { config } from "@/config/index";
import { logger } from "@/common/logger";
import { Tokens } from "@/models/tokens";
import { Collections } from "@/models/collections";
import { collectionMetadataQueueJob } from "@/jobs/collection-updates/collection-metadata-queue-job";
import { OpenseaOrderParams } from "@/orderbook/orders/seaport-v1.1";
import { parseProtocolData } from "@/websockets/opensea";
import { orderbookOrdersJob } from "@/jobs/orderbook/orderbook-orders-job";
import { getNetworkSettings, getOpenseaNetworkName } from "@/config/network";

export class OpenseaOrdersFetchJob extends AbstractRabbitMqJobHandler {
  queueName = "opensea-orders-fetch-queue";
  maxRetries = 10;
  concurrency = 1;
  timeout = 5 * 60 * 1000;
  singleActiveConsumer = true;
  backoff = {
    type: "fixed",
    delay: 5000,
  } as BackoffStrategy;

  public async process() {
    let collectionOffers = [];
    let rateLimitExpiredIn = 0;

    const pendingRefreshOpenseaCollectionOffersCollections =
      new PendingRefreshOpenseaCollectionOffersCollections();
    const refreshOpenseaCollectionOffersCollections =
      await pendingRefreshOpenseaCollectionOffersCollections.get(1);

    // If no more tokens
    if (!_.isEmpty(refreshOpenseaCollectionOffersCollections)) {
      try {
        const fetchCollectionOffersResponse = await axios.get(
          `https://${
            getNetworkSettings().isTestnet ? "testnets-api" : "api"
          }.opensea.io/api/v2/offers/collection/${
            refreshOpenseaCollectionOffersCollections[0].slug
          }`,
          {
            headers: getNetworkSettings().isTestnet
              ? {
                  "Content-Type": "application/json",
                }
              : {
                  "Content-Type": "application/json",
                  "X-Api-Key": config.openSeaApiKey,
                },
          }
        );

        collectionOffers = fetchCollectionOffersResponse.data.offers;
      } catch (error) {
        if ((error as any).response?.status === 429) {
          logger.info(this.queueName, `Throttled. error=${JSON.stringify(error)}`);

          rateLimitExpiredIn = 5;

          await pendingRefreshOpenseaCollectionOffersCollections.add(
            refreshOpenseaCollectionOffersCollections,
            true
          );
        } else if ((error as any).response?.status === 404) {
          logger.warn(
            this.queueName,
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

            await collectionMetadataQueueJob.addToQueue({
              contract: collectionResult!.contract,
              tokenId,
              community: collectionResult!.community,
              forceRefresh: false,
            });
          } catch {
            // Skip on any errors
          }
        } else {
          logger.error(
            this.queueName,
            `fetchCollectionOffers failed. error=${JSON.stringify(error)}`
          );
        }
      }
    }

    logger.info(
      this.queueName,
      `Success. refreshOpenseaCollectionOffersCollections=${JSON.stringify(
        refreshOpenseaCollectionOffersCollections
      )}, collectionOffersCount=${
        collectionOffers.length
      }, rateLimitExpiredIn=${rateLimitExpiredIn}`
    );

    for (const collectionOffer of collectionOffers) {
      if (getOpenseaNetworkName() === collectionOffer.chain) {
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

            await orderbookOrdersJob.addToQueue([orderInfo]);
          }
        }
      }
    }

    // If there are potentially more collections to process trigger another job
    if (rateLimitExpiredIn || _.size(refreshOpenseaCollectionOffersCollections) == 1) {
      if (await extendLock(this.getLockName(), 60 * 5 + rateLimitExpiredIn)) {
        await this.addToQueue(rateLimitExpiredIn * 1000);
      }
    } else {
      await releaseLock(this.getLockName());
    }
  }

  public getLockName() {
    return `${this.queueName}`;
  }

  public async addToQueue(delay = 0) {
    await this.send({}, delay);
  }
}

export const openseaOrdersFetchJob = new OpenseaOrdersFetchJob();
