import { idb } from "@/common/db";

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { RabbitMQMessage } from "@/common/rabbit-mq";
import _ from "lodash";

export type BackfillDailyApiUsageDatesJobCursorInfo = {
  id?: number;
};

export class BackfillDailyApiUsageDatesJob extends AbstractRabbitMqJobHandler {
  queueName = "backfill-daily-api-usage-dates";
  maxRetries = 10;
  concurrency = 1;
  persistent = false;
  lazyMode = false;
  singleActiveConsumer = true;

  protected async process(payload: BackfillDailyApiUsageDatesJobCursorInfo) {
    let { id } = payload;
    const values: {
      limit: number;
      id?: number;
    } = {
      limit: 500,
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
              SELECT id, day
              FROM daily_api_usage
              WHERE created_at IS NULL
              ${cursor}
              ORDER BY id ASC
              LIMIT $/limit/
          )
          
          UPDATE daily_api_usage
          SET created_at = x.day, updated_at = x.day
          FROM x
          WHERE daily_api_usage."id" = x."id"
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
      cursor?: BackfillDailyApiUsageDatesJobCursorInfo;
    }
  ) {
    if (processResult.addToQueue) {
      await this.addToQueue(processResult.cursor);
    }
  }

  public async addToQueue(cursor?: BackfillDailyApiUsageDatesJobCursorInfo, delay = 0) {
    await this.send({ payload: cursor ?? {} }, delay);
  }
}

export const backfillDailyApiUsageDatesJob = new BackfillDailyApiUsageDatesJob();

// if (config.chainId !== 1) {
//   redlock
//     .acquire(["backfill-daily-api-usage-dates-lock"], 60 * 60 * 24 * 30 * 1000)
//     .then(async () => {
//       await backfillUserCollectionsJob.addToQueue().
//     })
//     .catch(() => {
//       // Skip on any errors
//     });
// }
