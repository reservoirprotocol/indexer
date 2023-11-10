import { config } from "@/config/index";
import { logger } from "@/common/logger";
import { idb } from "@/common/db";
import { redis } from "@/common/redis";

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";

import { CollectionDocumentBuilder } from "@/elasticsearch/indexes/collections/base";
import * as CollectionIndex from "@/elasticsearch/indexes/collections";
import { elasticsearch } from "@/common/elasticsearch";

export class BackfillCollectionsElasticsearchJob extends AbstractRabbitMqJobHandler {
  queueName = "backfill-collections-elasticsearch-queue";
  maxRetries = 10;
  concurrency = 5;
  persistent = true;
  lazyMode = true;

  protected async process(payload: BackfillCollectionsElasticsearchJobPayload) {
    if (!payload.cursor) {
      logger.info(
        this.queueName,
        JSON.stringify({
          topic: "debugCollectionsIndex",
          message: `Start. fromTimestamp=${payload.fromTimestamp}`,
          payload,
        })
      );
    }

    let nextCursor;

    const collectionEvents = [];

    try {
      let continuationFilter = "";
      let fromTimestampFilter = "";

      const limit = Number(await redis.get(`${this.queueName}-limit`)) || 1000;

      if (payload.cursor) {
        continuationFilter = `WHERE (collections.updated_at, collections.id) > (to_timestamp($/updatedAt/), $/id/)`;
      }

      if (payload.fromTimestamp) {
        if (payload.cursor) {
          fromTimestampFilter = `AND (collections.updated_at) > (to_timestamp($/fromTimestamp/))`;
        } else {
          fromTimestampFilter = `WHERE (collections.updated_at) > (to_timestamp($/fromTimestamp/))`;
        }
      }

      const rawResults = await idb.manyOrNone(
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
            ${continuationFilter}
            ${fromTimestampFilter}
            ORDER BY updated_at, id
            LIMIT $/limit/;
          `,
        {
          fromTimestamp: payload.fromTimestamp,
          updatedAt: payload.cursor?.updatedAt,
          id: payload.cursor?.id,
          limit,
        }
      );

      if (rawResults.length) {
        for (const rawResult of rawResults) {
          const documentId = `${config.chainId}:${rawResult.id}`;

          const document = new CollectionDocumentBuilder().buildDocument({
            id: rawResult.id,
            created_at: new Date(rawResult.created_at),
            contract: rawResult.contract,
            name: rawResult.name,
            slug: rawResult.slug,
            image: rawResult.image,
            community: rawResult.community,
            token_count: rawResult.token_count,
            is_spam: rawResult.is_spam,
            all_time_volume: Number(rawResult.all_time_volume),
          });

          collectionEvents.push({ kind: "index", _id: documentId, document });
        }

        const lastResult = rawResults[rawResults.length - 1];

        nextCursor = {
          updatedAt: lastResult.updated_ts,
          id: lastResult.id,
        };
      }
    } catch (error) {
      logger.error(
        this.queueName,
        JSON.stringify({
          topic: "debugCollectionsIndex",
          message: `Error generating collection document. error=${error}`,
          error,
          payload,
        })
      );

      throw error;
    }

    if (collectionEvents.length) {
      const bulkIndexOps = collectionEvents
        .filter((collectionEvent) => collectionEvent.kind == "index")
        .flatMap((collectionEvent) => [
          { index: { _index: CollectionIndex.getIndexName(), _id: collectionEvent._id } },
          collectionEvent.document,
        ]);

      const bulkDeleteOps = collectionEvents
        .filter((collectionEvent) => collectionEvent.kind == "delete")
        .flatMap((collectionEvent) => ({
          delete: { _index: CollectionIndex.getIndexName(), _id: collectionEvent._id },
        }));

      if (bulkIndexOps.length) {
        await elasticsearch.bulk({
          body: bulkIndexOps,
        });
      }

      if (bulkDeleteOps.length) {
        await elasticsearch.bulk({
          body: bulkDeleteOps,
        });
      }

      logger.info(
        this.queueName,
        JSON.stringify({
          topic: "debugCollectionsIndex",
          message: `Indexed ${bulkIndexOps.length} collections. Deleted ${bulkDeleteOps.length} collections`,
          payload,
          nextCursor,
        })
      );

      await backfillCollectionsElasticsearchJob.addToQueue(payload.fromTimestamp, nextCursor);
    }
  }

  public async addToQueue(
    fromTimestamp?: number,
    cursor?: {
      updatedAt: string;
      id: string;
    }
  ) {
    if (!config.doElasticsearchWork) {
      return;
    }

    await this.send({
      payload: {
        fromTimestamp,
        cursor,
      },
    });
  }
}

export const backfillCollectionsElasticsearchJob = new BackfillCollectionsElasticsearchJob();

export type BackfillCollectionsElasticsearchJobPayload = {
  fromTimestamp?: number;
  cursor?: {
    updatedAt: string;
    id: string;
  };
};
