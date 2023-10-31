import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { idb } from "@/common/db";
import { toBuffer } from "@/common/utils";

export enum GeneralTrackingOrigin {
  DailyProcess = "daily-process",
  CollectionRefresh = "collection-refresh",
  API = "api",
}

export enum GeneralTrackingContext {
  SpamContractUpdate = "spam-contract-update",
  SpamCollectionUpdate = "spam-collection-update",
  SpamTokenUpdate = "spam-token-update",
  DisableMetadataUpdate = "disable-metadata-update",
}

export type GeneralTrackingJobPayload = {
  context: GeneralTrackingContext;
  origin: GeneralTrackingOrigin;
  actionTakerIdentifier: string;
  contract?: string;
  collection?: string;
  tokenId?: string;
  data?: object;
};

export class GeneralTrackingJob extends AbstractRabbitMqJobHandler {
  queueName = "general-tracking";
  maxRetries = 10;
  concurrency = 10;
  lazyMode = true;

  protected async process(payload: GeneralTrackingJobPayload) {
    const { context, origin, actionTakerIdentifier, contract, collection, tokenId, data } = payload;

    await idb.none(
      `
        INSERT INTO actions_tracking (
          context,
          origin,
          action_taker_identifier,
          contract,
          collection_id,
          token_id,
          data
        ) VALUES (
          $/context/,
          $/origin/,
          $/actionTakerIdentifier/,
          $/contract/,
          $/collection/,
          $/tokenId/,
          $/data:json/
        )
        `,
      {
        context,
        origin,
        actionTakerIdentifier,
        contract: contract ? toBuffer(contract) : null,
        collection: collection ?? null,
        tokenId: tokenId ?? null,
        data: data ?? {},
      }
    );
  }

  public async addToQueue(params: GeneralTrackingJobPayload[]) {
    await this.sendBatch(params.map((p) => ({ payload: p })));
  }
}

export const generalTrackingJob = new GeneralTrackingJob();
