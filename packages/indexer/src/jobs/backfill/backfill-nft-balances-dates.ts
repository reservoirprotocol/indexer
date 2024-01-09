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

    let createdAtValue = "";
    switch (config.chainId) {
      case 1:
        createdAtValue = "WHERE created_at = '2024-01-09 19:39:22.163333+00'";
        break;

      case 10:
        createdAtValue = "WHERE created_at = '2024-01-09 19:39:23.497636+00'";
        break;

      case 56:
        createdAtValue = "WHERE created_at = '2024-01-09 19:39:22.589759+00'";
        break;

      case 137:
        createdAtValue = "WHERE created_at = '2024-01-09 19:39:22.136198+00'";
        break;

      case 324:
        createdAtValue = "WHERE created_at = '2024-01-09 19:39:38.945429+00'";
        break;

      case 42161:
        createdAtValue = "WHERE created_at = '2024-01-09 19:39:22.132056+00'";
        break;

      case 534353:
        createdAtValue = "WHERE created_at = '2024-01-09 19:39:38.475734+00'";
        break;

      case 11155111:
        createdAtValue = "WHERE created_at = '2024-01-09 19:39:37.536578+00'";
        break;

      case 80001:
        createdAtValue = "WHERE created_at = '2024-01-09 19:39:37.56473+00'";
        break;

      case 84531:
        createdAtValue = "WHERE created_at = '2024-01-09 19:39:23.973227+00'";
        break;

      case 42170:
        createdAtValue = "WHERE created_at = '2024-01-09 19:39:22.234949+00'";
        break;

      case 999:
        createdAtValue = "WHERE created_at = '2024-01-09 19:39:23.972381+00'";
        break;

      case 7777777:
        createdAtValue = "WHERE created_at = '2024-01-09 19:39:23.468775+00'";
        break;

      case 43114:
        createdAtValue = "WHERE created_at = '2024-01-09 19:39:33.97113+00'";
        break;

      case 8453:
        createdAtValue = "WHERE created_at = '2024-01-09 19:39:22.311034+00'";
        break;

      case 59144:
        createdAtValue = "WHERE created_at = '2024-01-09 19:39:42.42207+00'";
        break;

      case 1101:
        createdAtValue = "WHERE created_at = '2024-01-09 19:39:42.721505+00'";
        break;

      case 2863311531:
        createdAtValue = "WHERE created_at = '2024-01-09 19:39:44.313503+00'";
        break;

      case 534352:
        createdAtValue = "WHERE created_at = '2024-01-09 19:39:44.401014+00'";
        break;
    }

    const results = await idb.manyOrNone(
      `
        UPDATE nft_balances
        SET created_at = COALESCE(acquired_at, now()), updated_at = COALESCE(acquired_at, now())
        WHERE (contract, token_id, owner, amount) IN (
          SELECT contract, token_id, owner, amount
          FROM nft_balances
          ${createdAtValue}
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
