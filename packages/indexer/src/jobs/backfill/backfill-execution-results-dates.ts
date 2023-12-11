import { idb } from "@/common/db";

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { RabbitMQMessage } from "@/common/rabbit-mq";
import _ from "lodash";
import { config } from "@/config/index";

export type BackfillExecutionResultsDatesJobCursorInfo = {
  id?: number;
};

export class BackfillExecutionResultsDatesJob extends AbstractRabbitMqJobHandler {
  queueName = "backfill-execution-results-dates";
  maxRetries = 10;
  concurrency = 1;
  persistent = false;
  lazyMode = false;
  singleActiveConsumer = true;

  protected async process(payload: BackfillExecutionResultsDatesJobCursorInfo) {
    let { id } = payload;
    const values: {
      limit: number;
      id?: number;
    } = {
      limit: _.includes([56, 324, 42161], config.chainId)
        ? config.chainId === 324
          ? 10
          : 50
        : 500,
    };

    let addToQueue = false;

    let cursor = "";

    if (id) {
      cursor = `AND id > $/id/`;
      values.id = id;
    }

    const results = await idb.manyOrNone(
      `
          WITH x AS (
              SELECT id, created_at
              FROM execution_results
              WHERE updated_at IS NULL
              ${cursor}
              ORDER BY id ASC
              LIMIT $/limit/
          )
          
          UPDATE execution_results
          SET updated_at = x.created_at
          FROM x
          WHERE execution_results."id" = x."id"
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
      cursor?: BackfillExecutionResultsDatesJobCursorInfo;
    }
  ) {
    if (processResult.addToQueue) {
      await this.addToQueue(processResult.cursor);
    }
  }

  public async addToQueue(cursor?: BackfillExecutionResultsDatesJobCursorInfo, delay = 0) {
    await this.send({ payload: cursor ?? {} }, delay);
  }
}

export const backfillExecutionResultsDatesJob = new BackfillExecutionResultsDatesJob();

// if (config.chainId !== 1) {
//   redlock
//     .acquire([`${backfillExecutionResultsDatesJob.getQueue()}-lock`], 60 * 60 * 24 * 30 * 1000)
//     .then(async () => {
//       await backfillExecutionResultsDatesJob.addToQueue().
//     })
//     .catch(() => {
//       // Skip on any errors
//     });
// }
