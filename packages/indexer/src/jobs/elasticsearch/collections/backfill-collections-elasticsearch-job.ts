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
              collections.contract,
              collections.creator,
              collections.all_time_volume,
              collections.is_spam,
              collections.metadata_disabled,
              collections.token_count,
              collections.created_at,
              orders.id AS floor_sell_id,
              orders.value AS floor_sell_value,
              orders.currency AS floor_sell_currency,
              orders.currency_price AS floor_sell_currency_price,
              extract(epoch from collections.updated_at) AS updated_ts
            FROM collections
            LEFT JOIN orders ON orders.id = collections.floor_sell_id
            ${continuationFilter}
            ${fromTimestampFilter}
            ORDER BY collections.updated_at, collections.id
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
            metadata_disabled: rawResult.metadata_disabled,
            is_spam: rawResult.is_spam,
            all_time_volume: rawResult.all_time_volume,
            floor_sell_id: rawResult.floor_sell_id,
            floor_sell_value: rawResult.floor_sell_value,
            floor_sell_currency: rawResult.floor_sell_currency,
            floor_sell_currency_price: rawResult.floor_sell_currency_price,
            opensea_verification_status: rawResult.opensea_verification_status,
          });

          collectionEvents.push({ kind: "index", _id: documentId, document });
        }

        const lastResult = rawResults[rawResults.length - 1];

        nextCursor = {
          updatedAt: lastResult.updated_ts,
          id: lastResult.id,
        };

        if (collectionEvents.length) {
          const bulkIndexOps = collectionEvents
            .filter((collectionEvent) => collectionEvent.kind == "index")
            .flatMap((collectionEvent) => [
              { index: { _index: CollectionIndex.getIndexName(), _id: collectionEvent._id } },
              collectionEvent.document,
            ]);

          const bulkIndexResponse = await elasticsearch.bulk({
            body: bulkIndexOps,
          });

          logger.info(
            this.queueName,
            JSON.stringify({
              topic: "debugCollectionsIndex",
              message: `Indexed ${bulkIndexOps.length} collections.`,
              payload,
              nextCursor,
              hasErrors: bulkIndexResponse.errors,
              bulkIndexResponse: bulkIndexResponse.errors ? bulkIndexResponse : undefined,
            })
          );

          await backfillCollectionsElasticsearchJob.addToQueue(payload.fromTimestamp, nextCursor);
        }
      } else {
        logger.info(
          this.queueName,
          JSON.stringify({
            topic: "debugCollectionsIndex",
            message: `Done.`,
            payload,
          })
        );
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
