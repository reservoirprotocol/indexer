import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { config } from "@/config/index";
import * as ActivitiesIndex from "@/elasticsearch/indexes/activities";
import _ from "lodash";
import { Tokens } from "@/models/tokens";
import crypto from "crypto";
import { logger } from "@/common/logger";

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

        await this.addToQueue({ contract, tokenId }, true);
      }
    }
  }

  public async addToQueue(payload: RefreshActivitiesTokenMetadataJobPayload, force = false) {
    if (!config.doElasticsearchWork) {
      return;
    }

    const jobId = force
      ? undefined
      : crypto
          .createHash("sha256")
          .update(
            `${payload.contract.toLowerCase()}${payload.tokenId}${JSON.stringify(
              payload.tokenUpdateData
            )}`
          )
          .digest("hex");

    await this.send({ payload, jobId });
  }
}

export const refreshActivitiesTokenMetadataJob = new RefreshActivitiesTokenMetadataJob();
