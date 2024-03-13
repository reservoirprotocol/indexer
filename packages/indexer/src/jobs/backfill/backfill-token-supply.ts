import { idb } from "@/common/db";

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { RabbitMQMessage } from "@/common/rabbit-mq";
import { fromBuffer, toBuffer } from "@/common/utils";
import { tokenReclacSupplyJob } from "@/jobs/token-updates/token-reclac-supply-job";
import _ from "lodash";

export type BackfillTokenSupplyJobCursorInfo = {
  collectionId: string;
  contract?: string;
  tokenId?: string;
};

export class BackfillTokenSupplyJob extends AbstractRabbitMqJobHandler {
  queueName = "backfill-token-supply";
  maxRetries = 10;
  concurrency = 1;
  persistent = false;
  lazyMode = false;
  singleActiveConsumer = true;

  public async process(payload: BackfillTokenSupplyJobCursorInfo) {
    const values = {
      collectionId: payload.collectionId,
      contract: payload.contract ? toBuffer(payload.contract) : "",
      tokenId: payload.tokenId,
      limit: 250,
    };

    const tokensToSync = [];

    let continuation = "";

    if (payload.tokenId && payload.contract) {
      continuation = `AND (contract, token_id) > ($/contract/, $/tokenId/)`;
    }

    const tokens = await idb.manyOrNone(
      `
        SELECT contract, token_id
        FROM tokens
        WHERE collection_id = $/collectionId/
        ${continuation}
        ORDER BY contract, token_id
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
    if (tokens.length == values.limit) {
      return {
        addToQueue: true,
        contract: fromBuffer(_.last(tokens).contract),
        tokenId: _.last(tokens).token_id,
      };
    }

    return { addToQueue: false };
  }

  public async onCompleted(
    rabbitMqMessage: RabbitMQMessage,
    processResult: {
      addToQueue: boolean;
      contract?: string;
      tokenId?: string;
    }
  ) {
    if (processResult.addToQueue) {
      await this.addToQueue(
        {
          collectionId: rabbitMqMessage.payload.collectionId,
          contract: processResult.contract,
          tokenId: processResult.tokenId,
        },
        10 * 1000
      );
    }
  }

  public async addToQueue(payload: BackfillTokenSupplyJobCursorInfo, delay = 0) {
    await this.send({ payload }, delay);
  }
}

export const backfillTokenSupplyJob = new BackfillTokenSupplyJob();
