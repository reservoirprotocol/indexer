import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import {
  orderUpdatesByIdJob,
  OrderUpdatesByIdJobPayload,
} from "@/jobs/order-updates/order-updates-by-id-job";

export type OpenseaOffChainCancellationsJobPayload = {
  orderId: string;
};

export default class OpenseaOffChainCancellationsJob extends AbstractRabbitMqJobHandler {
  queueName = "opensea-off-chain-cancellations";
  maxRetries = 3;
  concurrency = 30;
  backoff = {
    type: "exponential",
    delay: 10000,
  } as BackoffStrategy;

  public async process(payload: OpenseaOffChainCancellationsJobPayload) {
    const { orderId } = payload;

    logger.debug(this.queueName, JSON.stringify({ orderId }));

    try {
      const result = await idb.oneOrNone(
        `
            UPDATE orders SET
              fillability_status = 'cancelled',
              updated_at = now()
            WHERE orders.id = $/id/
              AND orders.fillability_status = 'fillable'
              AND orders.approval_status = 'approved'
            RETURNING orders.id
          `,
        { id: orderId }
      );

      if (result) {
        await orderUpdatesByIdJob.addToQueue([
          {
            context: `cancel-${orderId}`,
            id: orderId,
            trigger: {
              kind: "cancel",
            },
          } as OrderUpdatesByIdJobPayload,
        ]);
      }
    } catch (error) {
      logger.error(
        this.queueName,
        `Failed to handle OpenSea order invalidation info ${JSON.stringify(payload)}: ${error}`
      );
      throw error;
    }
  }

  public async addToQueue(params: OpenseaOffChainCancellationsJobPayload) {
    await this.send({ payload: params, jobId: params.orderId }, 5 * 1000);
  }
}

export const openseaOffChainCancellationsJob = new OpenseaOffChainCancellationsJob();
