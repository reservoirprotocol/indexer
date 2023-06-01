import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { Tokens } from "@/models/tokens";
import { Attributes } from "@/models/attributes";

export type ResyncAttributeValueCountsJobPayload = {
  collection: string;
  key: string;
  value: string;
};

export class ResyncAttributeValueCountsJob extends AbstractRabbitMqJobHandler {
  queueName = "resync-attribute-value-counts-queue";
  maxRetries = 10;
  concurrency = 3;

  protected async process(payload: ResyncAttributeValueCountsJobPayload) {
    const attributeValueCount = await Tokens.getTokenAttributesValueCount(
      payload.collection,
      payload.key,
      payload.value
    );

    if (!attributeValueCount) {
      const attribute = await Attributes.getAttributeByCollectionKeyValue(
        payload.collection,
        payload.key,
        payload.value
      );
      if (attribute) {
        await Attributes.delete(attribute.id);
      }
    } else {
      await Attributes.update(attributeValueCount.attributeId, {
        tokenCount: attributeValueCount.count,
      });
    }
  }

  public async addToQueue(params: ResyncAttributeValueCountsJobPayload, delay = 60 * 60 * 1000) {
    const jobId = `${params.collection}:${params.key}:${params.value}`;
    await this.send({ payload: params, jobId }, delay);
  }
}

export const resyncAttributeValueCountsJob = new ResyncAttributeValueCountsJob();
