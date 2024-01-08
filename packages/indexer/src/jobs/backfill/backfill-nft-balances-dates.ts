import { idb } from "@/common/db";

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { RabbitMQMessage } from "@/common/rabbit-mq";
import _ from "lodash";
import { fromBuffer, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { redlock } from "@/common/redis";

export type BackfillNftBalancesDatesJobCursorInfo = {
  contract: string;
  tokenId: string;
  owner: string;
  amount: string;
};

export class BackfillNftBalancesDatesJob extends AbstractRabbitMqJobHandler {
  queueName = "backfill-nft-balances-dates";
  maxRetries = 10;
  concurrency = 1;
  persistent = false;
  lazyMode = false;
  singleActiveConsumer = true;

  protected async process(payload: BackfillNftBalancesDatesJobCursorInfo) {
    const { contract, tokenId, owner, amount } = payload;
    const values: {
      limit: number;
      contract?: Buffer;
      tokenId?: string;
      owner?: Buffer;
      amount?: string;
    } = {
      limit: _.includes([56, 137, 324, 42161, 42170, 43114, 80001], config.chainId) ? 20 : 300,
    };

    let cursor = "";

    if (owner) {
      cursor = `AND (contract, token_id, owner, amount) > ($/contract/, $/tokenId/, $/owner/, $/amount/)`;
      values.contract = toBuffer(contract);
      values.tokenId = tokenId;
      values.owner = toBuffer(owner);
      values.amount = amount;
    }

    const results = await idb.manyOrNone(
      `
        UPDATE nft_balances
        SET created_at = acquired_at, updated_at = acquired_at
        WHERE (contract, token_id, owner, amount) IN (
          SELECT contract, token_id, owner, amount
          FROM nft_balances
          WHERE created_at IS NULL
          ${cursor}
          ORDER BY contract, token_id, owner, amount
          LIMIT $/limit/
        )
        RETURNING contract, token_id, owner, amount
        `,
      values
    );

    // Check if there are more potential users to sync
    if (results.length == values.limit) {
      const lastItem = _.last(results);

      return {
        addToQueue: true,
        cursor: {
          contract: fromBuffer(lastItem.contract),
          tokenId: lastItem.token_id,
          owner: fromBuffer(lastItem.owner),
          amount: lastItem.amount,
        },
      };
    }

    return { addToQueue: false };
  }

  public async onCompleted(
    rabbitMqMessage: RabbitMQMessage,
    processResult: {
      addToQueue: boolean;
      cursor?: BackfillNftBalancesDatesJobCursorInfo;
    }
  ) {
    if (processResult.addToQueue) {
      await this.addToQueue(processResult.cursor);
    }
  }

  public async addToQueue(cursor?: BackfillNftBalancesDatesJobCursorInfo, delay = 0) {
    await this.send({ payload: cursor ?? {} }, delay);
  }
}

export const backfillNftBalancesDatesJob = new BackfillNftBalancesDatesJob();

redlock
  .acquire([`${backfillNftBalancesDatesJob.getQueue()}-lock`], 60 * 60 * 24 * 30 * 1000)
  .then(async () => {
    await backfillNftBalancesDatesJob.addToQueue();
  })
  .catch(() => {
    // Skip on any errors
  });
