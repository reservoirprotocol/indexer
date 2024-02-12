import { idb } from "@/common/db";

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { RabbitMQMessage } from "@/common/rabbit-mq";
import _ from "lodash";
import { fromBuffer, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { logger } from "@/common/logger";

export type BackfillTransactionsDatesJobCursorInfo = {
  hash: string;
};

export class BackfillTransactionsDatesJob extends AbstractRabbitMqJobHandler {
  queueName = "backfill-transactions-dates";
  maxRetries = 10;
  concurrency = 1;
  persistent = false;
  lazyMode = false;
  singleActiveConsumer = true;

  public async process(payload: BackfillTransactionsDatesJobCursorInfo) {
    const { hash } = payload;
    const values: {
      limit: number;
      hash?: Buffer;
    } = {
      limit: _.includes([56, 324, 42161, 42170, 43114, 80001], config.chainId) ? 20 : 500,
    };

    let cursor = "";

    if (hash) {
      cursor = `AND hash >= $/hash/`;
      values.hash = toBuffer(hash);
    }

    const results = await idb.manyOrNone(
      `
          WITH x AS (
              SELECT hash, block_timestamp
              FROM transactions
              WHERE created_at IS NULL
              ${cursor}
              ORDER BY hash ASC
              LIMIT $/limit/
          )
          
          UPDATE transactions
          SET created_at = to_timestamp(x."block_timestamp")
          FROM x
          WHERE transactions."hash" = x."hash"
          RETURNING x.hash
        `,
      values
    );

    // Check if there are more potential users to sync
    if (results.length == values.limit) {
      const lastItem = _.last(results);

      logger.info(
        this.queueName,
        `Processed ${results.length} tokens. last hash=${fromBuffer(lastItem.hash)}`
      );

      return {
        addToQueue: true,
        cursor: { hash: fromBuffer(lastItem.hash) },
      };
    }

    return { addToQueue: false };
  }

  public async onCompleted(
    rabbitMqMessage: RabbitMQMessage,
    processResult: {
      addToQueue: boolean;
      cursor?: BackfillTransactionsDatesJobCursorInfo;
    }
  ) {
    if (processResult.addToQueue) {
      await this.addToQueue(processResult.cursor);
    }
  }

  public async addToQueue(cursor?: BackfillTransactionsDatesJobCursorInfo, delay = 0) {
    await this.send({ payload: cursor ?? {} }, delay);
  }
}

export const backfillTransactionsDatesJob = new BackfillTransactionsDatesJob();

// redlock
//   .acquire([`${backfillTransactionsDatesJob.getQueue()}-lock`], 60 * 60 * 24 * 30 * 1000)
//   .then(async () => {
//     await backfillTransactionsDatesJob.addToQueue();
//   })
//   .catch(() => {
//     // Skip on any errors
//   });
