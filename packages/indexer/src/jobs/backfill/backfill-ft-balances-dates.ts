import { idb } from "@/common/db";

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { RabbitMQMessage } from "@/common/rabbit-mq";
import _ from "lodash";
import { fromBuffer, toBuffer } from "@/common/utils";
import { config } from "@/config/index";

export type BackfillFtBalancesDatesJobCursorInfo = {
  owner: string;
  contract: string;
};

export class BackfillFtBalancesDatesJob extends AbstractRabbitMqJobHandler {
  queueName = "backfill-ft-balances-dates";
  maxRetries = 10;
  concurrency = 1;
  persistent = false;
  lazyMode = false;
  singleActiveConsumer = true;

  protected async process(payload: BackfillFtBalancesDatesJobCursorInfo) {
    const { owner, contract } = payload;
    const values: {
      limit: number;
      contract?: Buffer;
      owner?: Buffer;
    } = {
      limit: _.includes([56, 324, 42161], config.chainId)
        ? config.chainId === 324
          ? 10
          : 50
        : 500,
    };

    let cursor = "";

    if (owner) {
      cursor = `AND (owner, contract) > ($/owner/, $/contract/)`;
      values.owner = toBuffer(owner);
      values.contract = toBuffer(contract);
    }

    const results = await idb.manyOrNone(
      `
        UPDATE ft_balances
        SET created_at = now(), updated_at = now()
        WHERE (owner, contract) IN (
          SELECT owner, contract
          FROM ft_balances
          WHERE created_at IS NULL
          ${cursor}
          ORDER BY owner, contract
          LIMIT $/limit/
        )
        RETURNING owner, contract
        `,
      values
    );

    // Check if there are more potential users to sync
    if (results.length == values.limit) {
      const lastItem = _.last(results);

      return {
        addToQueue: true,
        cursor: { owner: fromBuffer(lastItem.owner), contract: fromBuffer(lastItem.contract) },
      };
    }

    return { addToQueue: false };
  }

  public async onCompleted(
    rabbitMqMessage: RabbitMQMessage,
    processResult: {
      addToQueue: boolean;
      cursor?: BackfillFtBalancesDatesJobCursorInfo;
    }
  ) {
    if (processResult.addToQueue) {
      await this.addToQueue(processResult.cursor);
    }
  }

  public async addToQueue(cursor?: BackfillFtBalancesDatesJobCursorInfo, delay = 0) {
    await this.send({ payload: cursor ?? {} }, delay);
  }
}

export const backfillFtBalancesDatesJob = new BackfillFtBalancesDatesJob();

// if (config.chainId !== 1) {
//   redlock
//     .acquire([`${backfillFtBalancesDatesJob.getQueue()}-lock`], 60 * 60 * 24 * 30 * 1000)
//     .then(async () => {
//       await backfillFtBalancesDatesJob.addToQueue().
//     })
//     .catch(() => {
//       // Skip on any errors
//     });
// }
