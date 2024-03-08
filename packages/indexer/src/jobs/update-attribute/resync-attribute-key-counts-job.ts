import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { Tokens } from "@/models/tokens";
import { AttributeKeys } from "@/models/attribute-keys";
import { logger } from "@/common/logger";
import { config } from "@/config/index";

export type ResyncAttributeKeyCountsJobPayload = {
  collection: string;
  key: string;
};

export default class ResyncAttributeKeyCountsJob extends AbstractRabbitMqJobHandler {
  queueName = "resync-attribute-key-counts-queue";
  maxRetries = 10;
  concurrency = 3;

  public async process(payload: ResyncAttributeKeyCountsJobPayload) {
    const { collection, key } = payload;

    const attributeKeyCount = await Tokens.getTokenAttributesKeyCount(
      collection,
      key,
      config.chainId !== 137
    );

    // If there are no more token for the given key delete it
    if (!attributeKeyCount) {
      await AttributeKeys.delete(collection, key);

      logger.info(
        this.queueName,
        `Deleted from collection=${collection}, key=${key}, count=${attributeKeyCount}`
      );
    } else {
      await AttributeKeys.update(collection, key, {
        attributeCount: attributeKeyCount.count,
      });

      logger.info(
        this.queueName,
        `Updated collection=${collection}, key=${key}, count=${attributeKeyCount.count}`
      );
    }
  }

  public async addToQueue(params: ResyncAttributeKeyCountsJobPayload, delay = 60 * 60 * 1000) {
    const jobId = `${params.collection}:${params.key}`;
    await this.send({ payload: params, jobId }, delay);
  }
}

export const resyncAttributeKeyCountsJob = new ResyncAttributeKeyCountsJob();
