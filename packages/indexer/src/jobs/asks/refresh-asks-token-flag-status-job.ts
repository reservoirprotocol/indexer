import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { config } from "@/config/index";
import * as AsksIndex from "@/elasticsearch/indexes/asks";
import _ from "lodash";
import { Tokens } from "@/models/tokens";
import crypto from "crypto";
import { RabbitMQMessage } from "@/common/rabbit-mq";
import { logger } from "@/common/logger";

export type RefreshAsksTokenFlagStatusJobPayload = {
  contract: string;
  tokenId: string;
};

export default class RefreshAsksTokenFlagStatusJob extends AbstractRabbitMqJobHandler {
  queueName = "refresh-asks-token-flag-status-queue";
  maxRetries = 10;
  concurrency = 2;
  persistent = true;
  lazyMode = true;

  protected async process(payload: RefreshAsksTokenFlagStatusJobPayload) {
    let addToQueue = false;

    const { contract, tokenId } = payload;

    const tokenUpdateData = await Tokens.getByContractAndTokenId(contract, tokenId);

    logger.info(
      this.queueName,
      JSON.stringify({
        topic: "debugAskIndex",
        message: `Start. contract=${contract}, tokenId=${tokenId}, isFlagged=${tokenUpdateData?.isFlagged}`,
      })
    );

    if (!_.isEmpty(tokenUpdateData)) {
      const keepGoing = await AsksIndex.updateAsksTokenFlagStatus(
        contract,
        tokenId,
        tokenUpdateData?.isFlagged
      );

      if (keepGoing) {
        addToQueue = true;
      }
    }

    return { addToQueue };
  }

  public async onCompleted(message: RabbitMQMessage, processResult: { addToQueue: boolean }) {
    if (processResult.addToQueue) {
      await this.addToQueue(message.payload.contract, message.payload.tokenId);
    }
  }

  public async addToQueue(contract: string, tokenId: string) {
    if (!config.doElasticsearchWork || config.chainId !== 1) {
      return;
    }

    const jobId = crypto
      .createHash("sha256")
      .update(`${contract.toLowerCase()}${tokenId}`)
      .digest("hex");

    await this.send({ payload: { contract, tokenId }, jobId });
  }
}

export const refreshAsksTokenFlagStatusJob = new RefreshAsksTokenFlagStatusJob();
