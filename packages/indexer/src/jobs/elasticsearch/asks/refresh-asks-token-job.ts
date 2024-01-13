import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { config } from "@/config/index";
import * as AsksIndex from "@/elasticsearch/indexes/asks";
import _ from "lodash";
import { Tokens } from "@/models/tokens";
import crypto from "crypto";
import { RabbitMQMessage } from "@/common/rabbit-mq";

export type RefreshAsksTokenJobPayload = {
  contract: string;
  tokenId: string;
};

export default class RefreshAsksTokenJob extends AbstractRabbitMqJobHandler {
  queueName = "refresh-asks-token-queue";
  maxRetries = 10;
  concurrency = 2;
  persistent = true;
  lazyMode = true;

  protected async process(payload: RefreshAsksTokenJobPayload) {
    return;

    let addToQueue = false;

    const { contract, tokenId } = payload;

    const tokenData = await Tokens.getByContractAndTokenId(contract, tokenId);

    if (!_.isEmpty(tokenData)) {
      const keepGoing = await AsksIndex.updateAsksTokenData(contract, tokenId, tokenData);

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
    if (!config.doElasticsearchWork) {
      return;
    }

    const jobId = crypto
      .createHash("sha256")
      .update(`${contract.toLowerCase()}:${tokenId}`)
      .digest("hex");

    await this.send({ payload: { contract, tokenId }, jobId });
  }
}

export const refreshAsksTokenJob = new RefreshAsksTokenJob();
