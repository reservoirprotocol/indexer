import { idb } from "@/common/db";

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";

import { toBuffer } from "@/common/utils";
import { inject } from "@/api/index";

export type BackfillInvalidatedPPV2OrdersJobPayload = {
  contract: string;
};

export class BackfillInvalidatedPPV2OrdersJob extends AbstractRabbitMqJobHandler {
  queueName = "backfill-invalidated-ppv2-orders";
  maxRetries = 10;
  concurrency = 1;
  persistent = false;
  lazyMode = false;
  singleActiveConsumer = true;

  public async process(payload: BackfillInvalidatedPPV2OrdersJobPayload) {
    const { contract } = payload;

    const disabledOrders: { id: string }[] = await idb.manyOrNone(
      `
          SELECT
            DISTINCT oe.order_id AS id
          FROM order_events oe
          JOIN tokens ON tokens.contract = oe.contract AND tokens.token_id = oe.token_id
          JOIN collections ON collections.id = tokens.collection_id
          WHERE oe.contract = $/contract/
          AND oe.kind = 'revalidation'
          AND oe.status = 'cancelled'
          AND OE.created_at < '2024-03-26 18:19:12' AND OE.created_at >= '2024-03-26 18:19:05'
          AND oe.price > collections.floor_sell_value
        `,
      { contract: toBuffer(contract) }
    );

    // Simulate
    await Promise.all(
      disabledOrders.map(({ id }) =>
        inject({
          method: "POST",
          url: `/management/orders/simulate/v1`,
          headers: {
            "Content-Type": "application/json",
          },
          payload: {
            id,
          },
        }).catch(() => {
          // Skip errors
        })
      )
    );
  }

  public async addToQueue(contract: string, delay = 0) {
    await this.send({ payload: { contract } }, delay);
  }
}

export const backfillInvalidatedPPV2OrdersJob = new BackfillInvalidatedPPV2OrdersJob();
