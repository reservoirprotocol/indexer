import { idb } from "@/common/db";

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { RabbitMQMessage } from "@/common/rabbit-mq";
import _ from "lodash";
import { fromBuffer, toBuffer } from "@/common/utils";

export type BackfillUsdPricesDatesJobCursorInfo = {
  currency: string;
};

export class BackfillUsdPricesDatesJob extends AbstractRabbitMqJobHandler {
  queueName = "backfill-usd-prices-dates";
  maxRetries = 10;
  concurrency = 1;
  persistent = false;
  lazyMode = false;
  singleActiveConsumer = true;

  protected async process(payload: BackfillUsdPricesDatesJobCursorInfo) {
    const { currency } = payload;
    const values: {
      limit: number;
      currency?: Buffer;
    } = {
      limit: 500,
    };

    let cursor = "";

    if (currency) {
      cursor = `AND currency >= $/currency/`;
      values.currency = toBuffer(currency);
    }

    const results = await idb.manyOrNone(
      `
          WITH x AS (
              SELECT currency, timestamp
              FROM usd_prices
              WHERE created_at IS NULL
              ${cursor}
              ORDER BY currency ASC
              LIMIT $/limit/
          )
          
          UPDATE usd_prices
          SET created_at = x."timestamp"
          FROM x
          WHERE usd_prices."timestamp" = x."timestamp"
          AND usd_prices.currency = x.currency
          RETURNING x.currency
        `,
      values
    );

    // Check if there are more potential users to sync
    if (results.length == values.limit) {
      const lastItem = _.last(results);

      return {
        addToQueue: true,
        cursor: { currency: fromBuffer(lastItem.currency) },
      };
    }

    return { addToQueue: false };
  }

  public async onCompleted(
    rabbitMqMessage: RabbitMQMessage,
    processResult: {
      addToQueue: boolean;
      cursor?: BackfillUsdPricesDatesJobCursorInfo;
    }
  ) {
    if (processResult.addToQueue) {
      await this.addToQueue(processResult.cursor);
    }
  }

  public async addToQueue(cursor?: BackfillUsdPricesDatesJobCursorInfo, delay = 0) {
    await this.send({ payload: cursor ?? {} }, delay);
  }
}

export const backfillUsdPricesDatesJob = new BackfillUsdPricesDatesJob();

// if (config.chainId !== 1) {
//   redlock
//     .acquire(["backfill-usd-prices-dates-lock"], 60 * 60 * 24 * 30 * 1000)
//     .then(async () => {
//       await backfillUserCollectionsJob.addToQueue().
//     })
//     .catch(() => {
//       // Skip on any errors
//     });
// }
