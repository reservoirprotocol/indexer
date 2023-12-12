import { idb } from "@/common/db";

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { RabbitMQMessage } from "@/common/rabbit-mq";
import _ from "lodash";
import { config } from "@/config/index";
import { redlock } from "@/common/redis";

export type BackfillFtTransferEventsDatesJobCursorInfo = {
  block: number;
};

export class BackfillFtTransferEventsDatesJob extends AbstractRabbitMqJobHandler {
  queueName = "backfill-ft-transfer-events-dates";
  maxRetries = 10;
  concurrency = 1;
  persistent = false;
  lazyMode = false;
  singleActiveConsumer = true;

  protected async process(payload: BackfillFtTransferEventsDatesJobCursorInfo) {
    const { block } = payload;
    const values: {
      limit: number;
      block?: number;
    } = {
      limit: _.includes([56, 324, 42161], config.chainId)
        ? config.chainId === 324
          ? 10
          : 50
        : 500,
    };

    let cursor = "";

    if (block) {
      cursor = `AND block >= $/block/`;
      values.block = block;
    }

    const results = await idb.manyOrNone(
      `
          WITH x AS (
              SELECT "timestamp", tx_hash, log_index 
              FROM ft_transfer_events
              WHERE created_at IS NULL
              ${cursor}
              ORDER BY block ASC
              LIMIT $/limit/
          )
          
          UPDATE ft_transfer_events
          SET created_at = to_timestamp(x."timestamp"), updated_at = to_timestamp(x."timestamp")
          FROM x
          WHERE ft_transfer_events."timestamp" = x."timestamp"
          AND ft_transfer_events.tx_hash = x.tx_hash
          AND ft_transfer_events.log_index = x.log_index
          RETURNING ft_transfer_events.block
        `,
      values
    );

    // Check if there are more potential users to sync
    if (results.length == values.limit) {
      const lastItem = _.last(results);

      return {
        addToQueue: true,
        cursor: { block: lastItem.block },
      };
    }

    return { addToQueue: false };
  }

  public async onCompleted(
    rabbitMqMessage: RabbitMQMessage,
    processResult: {
      addToQueue: boolean;
      cursor?: BackfillFtTransferEventsDatesJobCursorInfo;
    }
  ) {
    if (processResult.addToQueue) {
      await this.addToQueue(processResult.cursor);
    }
  }

  public async addToQueue(cursor?: BackfillFtTransferEventsDatesJobCursorInfo, delay = 0) {
    await this.send({ payload: cursor ?? {} }, delay);
  }
}

export const backfillFtTransferEventsDatesJob = new BackfillFtTransferEventsDatesJob();

redlock
  .acquire([`${backfillFtTransferEventsDatesJob.getQueue()}-lock`], 60 * 60 * 24 * 30 * 1000)
  .then(async () => {
    await backfillFtTransferEventsDatesJob.addToQueue();
  })
  .catch(() => {
    // Skip on any errors
  });
