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
              collections.royalties,
              collections.new_royalties,
              collections.contract,
              collections.token_id_range,
              collections.token_set_id,
              collections.creator,
              collections.day1_sales_count AS "day_sale_count",
              collections.day1_rank,
              collections.day1_volume,
              collections.day7_rank,
              collections.day7_volume,
              collections.day30_rank,
              collections.day30_volume,
              collections.all_time_rank,
              collections.all_time_volume,
              collections.day1_volume_change,
              collections.day7_volume_change,
              collections.day30_volume_change,
              collections.day1_floor_sell_value,
              collections.day7_floor_sell_value,
              collections.day30_floor_sell_value,
              collections.is_spam,
              collections.metadata_disabled,
              collections.token_count,
              collections.owner_count,
              collections.created_at,
              extract(epoch from collections.updated_at) AS updated_at,
              collections.top_buy_id,
              collections.top_buy_maker,        
              collections.minted_timestamp,
              (
                SELECT
                  COUNT(*)
                FROM tokens
                WHERE tokens.collection_id = collections.id
                  AND tokens.floor_sell_value IS NOT NULL
              ) AS on_sale_count,
              ARRAY(
                SELECT
                  tokens.image
                FROM tokens
                WHERE tokens.collection_id = collections.id
                ORDER BY rarity_rank DESC NULLS LAST
                LIMIT 4
              ) AS sample_images,
            extract(epoch from collections.updated_at) updated_ts
            FROM collections
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
          is_spam: rawResult.is_spam,
          all_time_volume: rawResult.all_time_volume,
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
