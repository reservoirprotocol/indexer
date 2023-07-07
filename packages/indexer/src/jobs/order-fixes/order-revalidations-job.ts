import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { idb } from "@/common/db";
import * as orderUpdatesById from "@/jobs/order-updates/by-id-queue";
import { logger } from "@/common/logger";

export type OrderRevalidationsJobPayload = {
  id: string;
  status: "active" | "inactive";
};

export class OrderRevalidationsJob extends AbstractRabbitMqJobHandler {
  queueName = "order-revalidations";
  maxRetries = 10;
  concurrency = 20;
  lazyMode = true;
  backoff = {
    type: "exponential",
    delay: 10000,
  } as BackoffStrategy;

  protected async process(payload: OrderRevalidationsJobPayload) {
    const { id, status } = payload;

    try {
      await idb.none(
        `
            UPDATE orders SET
              fillability_status = '${status === "active" ? "fillable" : "cancelled"}',
              approval_status = '${status === "active" ? "approved" : "disabled"}',
              updated_at = now()
            WHERE orders.id = $/id/
          `,
        { id }
      );

      // Recheck the order
      await orderUpdatesById.addToQueue([
        {
          context: `revalidation-${Date.now()}-${id}`,
          id,
          trigger: {
            kind: "revalidation",
          },
        } as orderUpdatesById.OrderInfo,
      ]);
    } catch (error) {
      logger.error(
        this.queueName,
        `Failed to handle order revalidation info ${JSON.stringify(payload)}: ${error}`
      );
      throw error;
    }
  }

  public async addToQueue(orderRevalidationInfos: OrderRevalidationsJobPayload[]) {
    await this.sendBatch(orderRevalidationInfos.map((info) => ({ payload: info })));
  }
}

export const orderRevalidationsJob = new OrderRevalidationsJob();
