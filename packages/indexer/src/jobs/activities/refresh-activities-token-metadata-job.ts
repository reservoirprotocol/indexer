import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { config } from "@/config/index";
import * as ActivitiesIndex from "@/elasticsearch/indexes/activities";
import _ from "lodash";
import { Tokens } from "@/models/tokens";
import crypto from "crypto";
import { logger } from "@/common/logger";
import { RabbitMQMessage } from "@/common/rabbit-mq";

export type RefreshActivitiesTokenMetadataJobPayload = {
  contract: string;
  tokenId: string;
  tokenUpdateData?: { name: string | null; image: string | null; media: string | null };
};

export class RefreshActivitiesTokenMetadataJob extends AbstractRabbitMqJobHandler {
  queueName = "refresh-activities-token-metadata-queue";
  maxRetries = 10;
  concurrency = 1;
  persistent = true;
  lazyMode = true;

  protected async process(payload: RefreshActivitiesTokenMetadataJobPayload) {
    let addToQueue = false;

    const { contract, tokenId } = payload;

    const tokenUpdateData =
      payload.tokenUpdateData ?? (await Tokens.getByContractAndTokenId(contract, tokenId));

    if (!_.isEmpty(tokenUpdateData)) {
      const keepGoing = await ActivitiesIndex.updateActivitiesTokenMetadata(
        contract,
        tokenId,
        tokenUpdateData
      );

      if (keepGoing) {
        logger.info(
          this.queueName,
          `KeepGoing. contract=${contract}, tokenId=${tokenId}, tokenUpdateData=${JSON.stringify(
            tokenUpdateData
          )}`
        );

        addToQueue = true;
      }
    }

    return { addToQueue };
  }

  public events() {
    this.once(
      "onCompleted",
      async (message: RabbitMQMessage, processResult: { addToQueue: boolean }) => {
        if (processResult.addToQueue) {
          await this.addToQueue(message.payload.contract, message.payload.tokenId);
        }
      }
    );
  }

  public async addToQueue(contract: string, tokenId: string) {
    if (!config.doElasticsearchWork) {
      return;
    }

    const jobId = crypto
      .createHash("sha256")
      .update(`${contract.toLowerCase()}${tokenId}`)
      .digest("hex");

    await this.send({ payload: { contract, tokenId }, jobId });
  }
}

export const refreshActivitiesTokenMetadataJob = new RefreshActivitiesTokenMetadataJob();
