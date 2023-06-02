import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { Tokens } from "@/models/tokens";
import { AttributeKeys } from "@/models/attribute-keys";
import { logger } from "@/common/logger";

export type ResyncAttributeKeyCountsJobPayload = {
  collection: string;
  key: string;
};

export class ResyncAttributeKeyCountsJob extends AbstractRabbitMqJobHandler {
  queueName = "resync-attribute-key-counts-queue";
  maxRetries = 10;
  concurrency = 3;

  protected async process(payload: ResyncAttributeKeyCountsJobPayload) {
    const attributeKeyCount = await Tokens.getTokenAttributesKeyCount(
      payload.collection,
      payload.key
    );

    // If there are no more token for the given key delete it
    if (!attributeKeyCount) {
      await AttributeKeys.delete(payload.collection, payload.key);

      logger.info(
        this.queueName,
        `Deleted from collection=${payload.collection}, key=${payload.key}, count=${attributeKeyCount}`
      );
    } else {
      await AttributeKeys.update(payload.collection, payload.key, {
        attributeCount: attributeKeyCount.count,
      });

      logger.info(
        this.queueName,
        `Updated collection=${payload.collection}, key=${payload.key}, count=${attributeKeyCount.count}`
      );
    }
  }

  public async addToQueue(params: ResyncAttributeKeyCountsJobPayload, delay = 60 * 60 * 1000) {
    const jobId = `${params.collection}:${params.key}`;
    await this.send({ payload: params, jobId }, delay);
  }
}

export const resyncAttributeKeyCountsJob = new ResyncAttributeKeyCountsJob();
