import { logger } from "@/common/logger";

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";

import { PendingCollectionEventsQueue } from "@/elasticsearch/indexes/collections/pending-collection-events-queue";

import { idb } from "@/common/db";
import { config } from "@/config/index";
import { CollectionDocumentBuilder } from "@/elasticsearch/indexes/collections/base";

export enum EventKind {
  newCollection = "newCollection",
  collectionUpdated = "collectionUpdated",
}

export type ProcessCollectionEventJobPayload = {
  kind: EventKind;
  data: CollectionInfo;
  context?: string;
};

export class ProcessCollectionEventJob extends AbstractRabbitMqJobHandler {
  queueName = "process-collection-event-queue";
  maxRetries = 10;
  concurrency = 15;
  persistent = true;
  lazyMode = true;

  protected async process(payload: ProcessCollectionEventJobPayload) {
    return;

    const { kind, data } = payload;

    const pendingCollectionEventsQueue = new PendingCollectionEventsQueue();

    const documentId = `${config.chainId}:${data.id}`;

    let document;

    try {
      const rawResult = await idb.oneOrNone(
        `
            SELECT        
              collections.id,
              collections.slug,
              collections.name,
              (collections.metadata ->> 'imageUrl')::TEXT AS "image",
              (collections.metadata ->> 'bannerImageUrl')::TEXT AS "banner",
              (collections.metadata ->> 'discordUrl')::TEXT AS "discord_url",
              (collections.metadata ->> 'description')::TEXT AS "description",
              (collections.metadata ->> 'externalUrl')::TEXT AS "external_url",
              (collections.metadata ->> 'twitterUsername')::TEXT AS "twitter_username",
              (collections.metadata ->> 'twitterUrl')::TEXT AS "twitter_url",
              (collections.metadata ->> 'safelistRequestStatus')::TEXT AS "opensea_verification_status",
              collections.contract,
              collections.creator,
              collections.all_time_volume,
              collections.is_spam,
              collections.metadata_disabled,
              collections.token_count,
              collections.created_at,
              orders.id AS "floor_sell_id",
              orders.value AS "floor_sell_value",
              orders.currency AS "floor_sell_currency",
              orders.currency_price AS "floor_sell_currency_price"
            FROM collections
            LEFT JOIN orders ON orders.id = collections.floor_sell_id
            WHERE collections.id = $/collectionId/
            LIMIT 1;
          `,
        {
          collectionId: data.id,
        }
      );

      if (rawResult) {
        document = new CollectionDocumentBuilder().buildDocument({
          id: rawResult.id,
          created_at: new Date(rawResult.created_at),
          contract: rawResult.contract,
          name: rawResult.name,
          slug: rawResult.slug,
          image: rawResult.image,
          community: rawResult.community,
          token_count: rawResult.token_count,
          metadata_disabled: rawResult.metadata_disabled,
          is_spam: rawResult.is_spam,
          all_time_volume: rawResult.all_time_volume,
          floor_sell_id: rawResult.floor_sell_id,
          floor_sell_value: rawResult.floor_sell_value,
          floor_sell_currency: rawResult.floor_sell_currency,
          floor_sell_currency_price: rawResult.floor_sell_currency_price,
          opensea_verification_status: rawResult.opensea_verification_status,
        });
      }
    } catch (error) {
      logger.error(
        this.queueName,
        JSON.stringify({
          topic: "debugCollectionsIndex",
          message: `Error generating ask document. kind=${kind}, id=${data.id}, error=${error}`,
          error,
          data,
        })
      );

      throw error;
    }

    if (document) {
      await pendingCollectionEventsQueue.add([{ document, kind: "index", _id: documentId }]);
    }
  }

  public async addToQueue(payloads: ProcessCollectionEventJobPayload[]) {
    if (!config.doElasticsearchWork) {
      return;
    }

    await this.sendBatch(payloads.map((payload) => ({ payload })));
  }
}

export const processCollectionEventJob = new ProcessCollectionEventJob();

interface CollectionInfo {
  id: string;
}
