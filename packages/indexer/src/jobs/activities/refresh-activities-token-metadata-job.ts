import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { config } from "@/config/index";
import * as ActivitiesIndex from "@/elasticsearch/indexes/activities";
import _ from "lodash";
import { Tokens } from "@/models/tokens";

export type RefreshActivitiesTokenMetadataJobPayload = {
  contract: string;
  tokenId: string;
  tokenUpdateData?: { name: string | null; image: string | null; media: string | null };
};

export class RefreshActivitiesTokenMetadataJob extends AbstractRabbitMqJobHandler {
  queueName = "refresh-activities-token-metadata-queue";
  maxRetries = 10;
  concurrency = 5;
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
        await this.addToQueue({ contract, tokenId, tokenUpdateData });
      }
    }
  }

  public async addToQueue(payload: RefreshActivitiesTokenMetadataJobPayload) {
    if (!config.doElasticsearchWork) {
      return;
    }

    await this.send({ payload });
  }
}

export const refreshActivitiesTokenMetadataJob = new RefreshActivitiesTokenMetadataJob();
