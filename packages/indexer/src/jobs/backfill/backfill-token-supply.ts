import { idb } from "@/common/db";

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { RabbitMQMessage } from "@/common/rabbit-mq";
import { fromBuffer } from "@/common/utils";
import { tokenReclacSupplyJob } from "@/jobs/token-updates/token-reclac-supply-job";

export class BackfillTokenSupplyJob extends AbstractRabbitMqJobHandler {
  queueName = "backfill-token-supply";
  maxRetries = 10;
  concurrency = 1;
  persistent = false;
  lazyMode = false;
  singleActiveConsumer = true;

  public async process(payload: { collectionId?: string }) {
    const values = {
      collectionId: payload.collectionId,
      limit: 250,
    };

    const tokensToSync = [];

    let whereFilter = "";

    if (payload.collectionId) {
      whereFilter = `WHERE collection_id = $/collectionId/`;
    } else {
      whereFilter = "WHERE supply IS NULL";
    }

    const tokens = await idb.manyOrNone(
      `
        SELECT contract, token_id
        FROM tokens
        ${whereFilter}
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
      await this.addToQueue(rabbitMqMessage.payload.collectionId, 10 * 1000);
    }
  }

  public async addToQueue(collectionId?: string, delay = 0) {
    await this.send({ payload: { collectionId } }, delay);
  }
}

export const backfillTokenSupplyJob = new BackfillTokenSupplyJob();
