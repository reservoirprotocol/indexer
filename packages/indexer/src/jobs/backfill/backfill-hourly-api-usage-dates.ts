import { idb } from "@/common/db";

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { RabbitMQMessage } from "@/common/rabbit-mq";
import _ from "lodash";

export type BackfillHourlyApiUsageDatesJobCursorInfo = {
  id?: number;
};

export class BackfillHourlyApiUsageDatesJob extends AbstractRabbitMqJobHandler {
  queueName = "backfill-hourly-api-usage-dates";
  maxRetries = 10;
  concurrency = 1;
  persistent = false;
  lazyMode = false;
  singleActiveConsumer = true;

  protected async process(payload: BackfillHourlyApiUsageDatesJobCursorInfo) {
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
              SELECT id, hour
              FROM hourly_api_usage
              WHERE created_at IS NULL
              ${cursor}
              ORDER BY id ASC
              LIMIT $/limit/
          )
          
          UPDATE hourly_api_usage
          SET created_at = x.hour, updated_at = x.hour
          FROM x
          WHERE hourly_api_usage."id" = x."id"
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
      cursor?: BackfillHourlyApiUsageDatesJobCursorInfo;
    }
  ) {
    if (processResult.addToQueue) {
      await this.addToQueue(processResult.cursor);
    }
  }

  public async addToQueue(cursor?: BackfillHourlyApiUsageDatesJobCursorInfo, delay = 0) {
    await this.send({ payload: cursor ?? {} }, delay);
  }
}

export const backfillHourlyApiUsageDatesJob = new BackfillHourlyApiUsageDatesJob();

// if (config.chainId !== 1) {
//   redlock
//     .acquire(["backfill-hourly-api-usage-dates-lock"], 60 * 60 * 24 * 30 * 1000)
//     .then(async () => {
//       await backfillUserCollectionsJob.addToQueue().
//     })
//     .catch(() => {
//       // Skip on any errors
//     });
// }
