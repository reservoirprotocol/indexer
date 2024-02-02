import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { idb } from "@/common/db";
import { toBuffer } from "@/common/utils";

export enum ActionsLogOrigin {
  DailyProcess = "daily-process",
  CollectionRefresh = "collection-refresh",
  API = "api",
  NameSpamCheck = "name-spam-check",
  UrlSpamCheck = "url-spam-check",
  MarkedAsVerified = "marked-as-verified",
  TransferBurstSpamCheck = "transfer-burst-spam-check",
}

export enum ActionsLogContext {
  SpamContractUpdate = "spam-contract-update",
  SpamCollectionUpdate = "spam-collection-update",
  NsfwCollectionUpdate = "nsfw-collection-update",
  SpamTokenUpdate = "spam-token-update",
  NsfwTokenUpdate = "nsfw-token-update",
  DisableMetadataUpdate = "disable-metadata-update",
  CollectionDataOverride = "collection-data-override",
}

export type ActionsLogJobPayload = {
  context: ActionsLogContext;
  origin: ActionsLogOrigin;
  actionTakerIdentifier: string;
  contract?: string;
  collection?: string;
  tokenId?: string;
  data?: object;
};

export class ActionsLogJob extends AbstractRabbitMqJobHandler {
  queueName = "actions-log";
  maxRetries = 10;
  concurrency = 10;

  public async process(payload: ActionsLogJobPayload) {
    const { context, origin, actionTakerIdentifier, contract, collection, tokenId, data } = payload;

    await idb.none(
      `
        INSERT INTO actions_log (
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
        data: data ?? null,
      }
    );
  }

  public async addToQueue(params: ActionsLogJobPayload[]) {
    await this.sendBatch(params.map((p) => ({ payload: p })));
  }
}

export const actionsLogJob = new ActionsLogJob();
