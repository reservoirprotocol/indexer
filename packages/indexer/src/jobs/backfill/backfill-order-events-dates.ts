import { idb } from "@/common/db";

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { RabbitMQMessage } from "@/common/rabbit-mq";
import _ from "lodash";
import { config } from "@/config/index";
import { redlock } from "@/common/redis";

export type BackfillOrderEventsDatesJobCursorInfo = {
  id?: number;
};

export class BackfillOrderEventsDatesJob extends AbstractRabbitMqJobHandler {
  queueName = "backfill-order-events-dates";
  maxRetries = 10;
  concurrency = 1;
  persistent = false;
  lazyMode = false;
  singleActiveConsumer = true;

  protected async process(payload: BackfillOrderEventsDatesJobCursorInfo) {
    let { id } = payload;
    const values: {
      limit: number;
      id?: number;
    } = {
      limit: _.includes([56, 137, 324, 42161, 42170, 43114, 80001], config.chainId) ? 20 : 500,
    };

    let addToQueue = false;

    let cursor = "";

    if (id) {
      cursor = `WHERE id > $/id/`;
      values.id = id;
    }

    const results = await idb.manyOrNone(
      `
          WITH x AS (
              SELECT id, created_at, updated_at
              FROM order_events
              ${cursor}
              ORDER BY id ASC
              LIMIT $/limit/
          )
          
          UPDATE order_events
          SET updated_at = x.created_at
          FROM x
          WHERE order_events."id" = x."id"
          AND order_events.updated_at IS NULL
          RETURNING x.id
        `,
      values
    );

    // Check if there are more potential users to sync
    if (results.length == values.limit) {
      const lastItem = _.last(results);
      addToQueue = true;
      id = lastItem.id;
    }

    return { addToQueue, cursor: { id: id } };
  }

  public async onCompleted(
    rabbitMqMessage: RabbitMQMessage,
    processResult: {
      addToQueue: boolean;
      cursor?: BackfillOrderEventsDatesJobCursorInfo;
    }
  ) {
    if (processResult.addToQueue) {
      await this.addToQueue(processResult.cursor);
    }
  }

  public async addToQueue(cursor?: BackfillOrderEventsDatesJobCursorInfo, delay = 0) {
    await this.send({ payload: cursor ?? {} }, delay);
  }
}

export const backfillOrderEventsDatesJob = new BackfillOrderEventsDatesJob();

redlock
  .acquire([`${backfillOrderEventsDatesJob.getQueue()}-lock`], 60 * 60 * 24 * 30 * 1000)
  .then(async () => {
    await backfillOrderEventsDatesJob.addToQueue();
  })
  .catch(() => {
    // Skip on any errors
  });
