import _ from "lodash";

import { randomUUID } from "crypto";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import { logger } from "@/common/logger";
import { Attributes } from "@/models/attributes";
import { Tokens } from "@/models/tokens";
import { resyncAttributeCacheJob } from "@/jobs/update-attribute/resync-attribute-cache-job";

const QUEUE_NAME = "handle-new-sell-order-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    removeOnComplete: 100,
    removeOnFail: 10000,
    timeout: 60 * 1000,
  },
});

new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { contract, tokenId, price, previousPrice } = job.data as HandleSellOrderParams;
      const tokenAttributes = await Tokens.getTokenAttributes(contract, tokenId);
      if (_.isEmpty(tokenAttributes)) {
        return;
      }

      const tokenAttributesIds = _.map(
        tokenAttributes,
        (tokenAttribute) => tokenAttribute.attributeId
      );

      // If this is a new sale
      if (_.isNull(previousPrice) && !_.isNull(price)) {
        await Attributes.incrementOnSaleCount(tokenAttributesIds, 1);
        await resyncAttributeCacheJob.addToQueue({ contract, tokenId });
      }

      // The sale ended
      if (!_.isNull(previousPrice) && _.isNull(price)) {
        await Attributes.incrementOnSaleCount(tokenAttributesIds, -1);
        await resyncAttributeCacheJob.addToQueue({ contract, tokenId });
      }

      // Check for new sell floor price
      if (!_.isNull(price)) {
        // Check for new sell floor price
        for (const tokenAttribute of tokenAttributes) {
          if (
            _.isNull(tokenAttribute.floorSellValue) ||
            Number(price) < Number(tokenAttribute.floorSellValue)
          ) {
            await Attributes.update(tokenAttribute.attributeId, {
              floorSellValue: price,
              sellUpdatedAt: new Date().toISOString(),
            });
          }
        }
      }
    },
    {
      connection: redis.duplicate(),
      concurrency: 6,
    }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export type HandleSellOrderParams = {
  contract: string;
  tokenId: string;
  price: number | null;
  previousPrice: number | null;
};

export const addToQueue = async (params: HandleSellOrderParams) => {
  await queue.add(randomUUID(), params);
};
