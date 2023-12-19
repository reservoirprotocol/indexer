import { idb } from "@/common/db";

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { RabbitMQMessage } from "@/common/rabbit-mq";
import _ from "lodash";
import { fromBuffer, toBuffer } from "@/common/utils";
import { redlock } from "@/common/redis";
import { config } from "@/config/index";
import { backfillTokenSupplyJob } from "@/jobs/backfill/backfill-token-supply";

export type BackfillTransactionTracesDatesJobCursorInfo = {
  hash: string;
};

export class BackfillTransactionTracesDatesJob extends AbstractRabbitMqJobHandler {
  queueName = "backfill-transaction-traces-dates";
  maxRetries = 10;
  concurrency = 1;
  persistent = false;
  lazyMode = false;
  singleActiveConsumer = true;

  protected async process(payload: BackfillTransactionTracesDatesJobCursorInfo) {
    const { hash } = payload;
    const values: {
      limit: number;
      hash?: Buffer;
    } = {
      limit: _.includes([56, 137, 324, 42161, 42170, 43114, 80001], config.chainId)
        ? config.chainId === 324
          ? 10
          : 50
        : 500,
    };

    let cursor = "";

    if (hash) {
      cursor = `AND tt.hash >= $/hash/`;
      values.hash = toBuffer(hash);
    }

    const results = await idb.manyOrNone(
      `
          WITH x AS (
              SELECT tt.hash, block_timestamp
              FROM transaction_traces tt
              LEFT JOIN transactions t ON tt.hash = t.hash
              WHERE tt.created_at IS NULL
              ${cursor}
              ORDER BY tt.hash ASC
              LIMIT $/limit/
          )
          
          UPDATE transaction_traces
          SET created_at = (CASE WHEN x.block_timestamp IS NULL THEN now() ELSE to_timestamp(x."block_timestamp") END)
          FROM x
          WHERE transaction_traces."hash" = x."hash"
          RETURNING transaction_traces.hash
        `,
      values
    );

    // Check if there are more potential users to sync
    if (results.length == values.limit) {
      const lastItem = _.last(results);

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
      cursor?: BackfillTransactionTracesDatesJobCursorInfo;
    }
  ) {
    if (processResult.addToQueue) {
      await this.addToQueue(processResult.cursor);
    }
  }

  public async addToQueue(cursor?: BackfillTransactionTracesDatesJobCursorInfo, delay = 0) {
    await this.send({ payload: cursor ?? {} }, delay);
  }
}

export const backfillTransactionTracesDatesJob = new BackfillTransactionTracesDatesJob();

if (config.chainId) {
  redlock
    .acquire([`${backfillTokenSupplyJob.getQueue()}-lock-3`], 60 * 60 * 24 * 30 * 1000)
    .then(async () => {
      await backfillTransactionTracesDatesJob.addToQueue();
    })
    .catch(() => {
      // Skip on any errors
    });
}
