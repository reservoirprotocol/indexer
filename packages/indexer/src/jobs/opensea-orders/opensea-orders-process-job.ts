import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import _ from "lodash";
import { PendingRefreshOpenseaCollectionOffersCollections } from "@/models/pending-refresh-opensea-collection-offers-collections";
import { acquireLock } from "@/common/redis";
import { openseaOrdersFetchJob } from "@/jobs/opensea-orders/opensea-orders-fetch-job";

export type OpenseaOrdersProcessJobPayload = {
  kind: "collection-offers";
  data: {
    contract: string;
    collectionId: string;
    collectionSlug: string;
  };
};

export class OpenseaOrdersProcessJob extends AbstractRabbitMqJobHandler {
  queueName = "opensea-orders-process-queue";
  maxRetries = 10;
  concurrency = 5;
  timeout = 60000;
  backoff = {
    type: "exponential",
    delay: 20000,
  } as BackoffStrategy;

  public async process(payload: OpenseaOrdersProcessJobPayload) {
    const { kind, data } = payload;
    const prioritized = !_.isUndefined(this.rabbitMqMessage?.prioritized);

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

      if (await acquireLock(openseaOrdersFetchJob.getLockName(), 60 * 5)) {
        await openseaOrdersFetchJob.addToQueue();
      }
    }
  }

  public async addToQueue(infos: OpenseaOrdersProcessJobPayload[], delayInSeconds = 0) {
    await this.sendBatch(
      infos.map((info) => ({
        payload: info,
        delay: delayInSeconds * 1000,
      }))
    );
  }
}

export const openseaOrdersProcessJob = new OpenseaOrdersProcessJob();
