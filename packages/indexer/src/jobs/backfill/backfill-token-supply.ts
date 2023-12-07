import { idb } from "@/common/db";

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { RabbitMQMessage } from "@/common/rabbit-mq";
import { fromBuffer } from "@/common/utils";
import { redlock } from "@/common/redis";
import { config } from "@/config/index";
import { tokenReclacSupplyJob } from "@/jobs/token-updates/token-reclac-supply-job";

export class BackfillTokenSupplyJob extends AbstractRabbitMqJobHandler {
  queueName = "backfill-token-supply";
  maxRetries = 10;
  concurrency = 1;
  persistent = false;
  lazyMode = false;
  singleActiveConsumer = true;

  protected async process() {
    const values = {
      limit: 250,
    };

    const tokensToSync = [];

    const tokens = await idb.manyOrNone(
      `
        SELECT contract, token_id
        FROM tokens
        WHERE supply IS NULL
        ${config.chainId === 56 ? "AND updated_at > '2023-07-18 01:42:31'" : ""}
        ORDER BY updated_at ASC
        LIMIT $/limit/
        `,
      values
    );

    if (tokens) {
      for (const token of tokens) {
        tokensToSync.push({ contract: fromBuffer(token.contract), tokenId: token.token_id });
      }

      await tokenReclacSupplyJob.addToQueue(tokensToSync, 0);
    }

    // Check if there are more potential users to sync
    if (tokensToSync.length == values.limit) {
      return {
        addToQueue: true,
      };
    }

    return { addToQueue: false };
  }

  public async onCompleted(
    rabbitMqMessage: RabbitMQMessage,
    processResult: {
      addToQueue: boolean;
    }
  ) {
    if (processResult.addToQueue) {
      await this.addToQueue(10 * 1000);
    }
  }

  public async addToQueue(delay = 0) {
    await this.send({ payload: {} }, delay);
  }
}

export const backfillTokenSupplyJob = new BackfillTokenSupplyJob();

if (config.chainId !== 1) {
  redlock
    .acquire(["backfill-token-supply-lock"], 60 * 60 * 24 * 30 * 1000)
    .then(async () => {
      await backfillTokenSupplyJob.addToQueue();
    })
    .catch(() => {
      // Skip on any errors
    });
}
