import { idb } from "@/common/db";

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { RabbitMQMessage } from "@/common/rabbit-mq";
import { fromBuffer } from "@/common/utils";
import { redlock } from "@/common/redis";
import { config } from "@/config/index";
import { tokenReclacSupplyJob } from "@/jobs/token-updates/token-reclac-supply-job";
import _ from "lodash";

export type CursorInfo = {
  cursor: string;
};

export class BackfillTokenSupplyJob extends AbstractRabbitMqJobHandler {
  queueName = "backfill-token-supply";
  maxRetries = 10;
  concurrency = 1;
  persistent = false;
  lazyMode = false;
  singleActiveConsumer = true;

  protected async process(payload: CursorInfo) {
    const { cursor } = payload;

    const values = {
      limit: 100,
    };

    const tokensToSync = [];

    const tokens = await idb.manyOrNone(
      `
        SELECT contract, token_id, updated_at::text
        FROM tokens
        WHERE supply IS NULL
        ${cursor ? `AND updated_at >= '${cursor}'` : ""}
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
        cursor: _.last(tokens).updated_at,
      };
    }

    return { addToQueue: false };
  }

  public async onCompleted(
    rabbitMqMessage: RabbitMQMessage,
    processResult: {
      addToQueue: boolean;
      cursor?: string;
    }
  ) {
    if (processResult.addToQueue) {
      await this.addToQueue({ cursor: processResult.cursor ?? "" });
    }
  }

  public async addToQueue(cursor?: CursorInfo, delay = 0) {
    await this.send({ payload: cursor ?? {} }, delay);
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
