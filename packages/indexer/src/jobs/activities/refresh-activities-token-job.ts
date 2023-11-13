import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { config } from "@/config/index";
import * as ActivitiesIndex from "@/elasticsearch/indexes/activities";
import { RabbitMQMessage } from "@/common/rabbit-mq";
import { Tokens } from "@/models/tokens";
import _ from "lodash";

export type RefreshActivitiesTokenJobPayload = {
  contract: string;
  tokenId: string;
};

export default class RefreshActivitiesTokenJob extends AbstractRabbitMqJobHandler {
  queueName = "refresh-activities-token-queue";
  maxRetries = 10;
  concurrency = 2;
  persistent = true;
  lazyMode = true;

  protected async process(payload: RefreshActivitiesTokenJobPayload) {
    let addToQueue = false;

    const { contract, tokenId } = payload;
    const tokenData = await Tokens.getByContractAndTokenId(contract, tokenId);

    if (!_.isNull(tokenData)) {
      const keepGoing = await ActivitiesIndex.updateActivitiesToken(
        contract,
        tokenId,
        tokenData.isSpam
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
    if (!config.doElasticsearchWork) {
      return;
    }

    await this.send({
      payload: { contract: contract.toLowerCase(), tokenId },
      jobId: `${contract.toLowerCase()}${tokenId}`,
    });
  }
}

export const refreshActivitiesTokenJob = new RefreshActivitiesTokenJob();
