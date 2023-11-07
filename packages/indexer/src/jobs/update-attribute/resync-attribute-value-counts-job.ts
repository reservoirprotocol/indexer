import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { Tokens } from "@/models/tokens";
import { Attributes } from "@/models/attributes";
import { redb } from "@/common/db";
import { orderRevalidationsJob } from "@/jobs/order-fixes/order-revalidations-job";
import { logger } from "@/common/logger";

export type ResyncAttributeValueCountsJobPayload = {
  collection: string;
  key: string;
  value: string;
};

export default class ResyncAttributeValueCountsJob extends AbstractRabbitMqJobHandler {
  queueName = "resync-attribute-value-counts-queue";
  maxRetries = 1;
  concurrency = 3;
  useSharedChannel = true;
  lazyMode = true;

  protected async process(payload: ResyncAttributeValueCountsJobPayload) {
    const { collection, key, value } = payload;

    const attributeValueCount = await Tokens.getTokenAttributesValueCount(collection, key, value);

    if (!attributeValueCount) {
      const attribute = await Attributes.getAttributeByCollectionKeyValue(collection, key, value);
      if (attribute) {
        await Attributes.delete(attribute.id);

        try {
          // Invalidate any active orders that are associated with this attribute.
          const orders = await redb.manyOrNone(
            `
              SELECT 
                orders.id 
              FROM 
                orders 
                JOIN token_sets ON orders.token_set_id = token_sets.id 
              WHERE 
                orders.side = 'buy' 
                AND orders.fillability_status = 'fillable' 
                AND orders.approval_status = 'approved' 
                AND token_sets.attribute_id = $/attributeId/
        `,
            {
              attributeId: attribute.id,
            }
          );

          if (orders.length) {
            logger.info(
              this.queueName,
              JSON.stringify({
                message: `Invalidating orders. attributeId=${attribute.id}`,
                attribute,
                orders,
              })
            );

            await orderRevalidationsJob.addToQueue(
              orders.map((order) => ({
                by: "id",
                data: { id: order.id, status: "inactive" },
              }))
            );
          }
        } catch (error) {
          logger.error(
            this.queueName,
            JSON.stringify({
              message: `Invalidating orders error. attributeId=${attribute.id}`,
              attribute,
              error,
            })
          );
        }
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
