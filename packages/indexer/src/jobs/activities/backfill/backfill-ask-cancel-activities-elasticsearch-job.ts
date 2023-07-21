import { config } from "@/config/index";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { ridb } from "@/common/db";
import { elasticsearch } from "@/common/elasticsearch";

import * as ActivitiesIndex from "@/elasticsearch/indexes/activities";

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import {
  OrderCursorInfo,
  BackfillBaseActivitiesElasticsearchJobPayload,
} from "@/jobs/activities/backfill/backfill-activities-elasticsearch-job";
import { AskCancelledEventHandler } from "@/elasticsearch/indexes/activities/event-handlers/ask-cancelled";

export class BackfillAskCancelActivitiesElasticsearchJob extends AbstractRabbitMqJobHandler {
  queueName = "backfill-ask-cancel-activities-elasticsearch-queue";
  maxRetries = 10;
  concurrency = 1;
  persistent = true;
  lazyMode = true;

  protected async process(payload: BackfillBaseActivitiesElasticsearchJobPayload) {
    const cursor = payload.cursor as OrderCursorInfo;
    const fromTimestamp = payload.fromTimestamp || 0;
    const toTimestamp = payload.toTimestamp || 9999999999;
    const indexName = payload.indexName ?? ActivitiesIndex.getIndexName();
    const keepGoing = payload.keepGoing;
    const limit = Number((await redis.get(`${this.queueName}-limit`)) || 500);

    if (!cursor) {
      logger.info(
        this.queueName,
        JSON.stringify({
          topic: "backfill-activities",
          message: `Start.`,
          fromTimestamp,
          toTimestamp,
          cursor,
          indexName,
          keepGoing,
        })
      );
    }

    try {
      let continuationFilter = "";

      if (cursor) {
        continuationFilter = `AND (updated_at, id) > (to_timestamp($/updatedAt/), $/id/)`;
      }

      const timestampFilter = `AND (updated_at >= to_timestamp($/fromTimestamp/) AND updated_at < to_timestamp($/toTimestamp/))`;

      const query = `
            ${AskCancelledEventHandler.buildBaseQuery()}
            WHERE side = 'sell' AND fillability_status = 'cancelled'
            ${timestampFilter}
            ${continuationFilter}
            ORDER BY updated_at, id
            LIMIT $/limit/;
          `;

      const results = await ridb.manyOrNone(query, {
        id: cursor?.id,
        updatedAt: cursor?.updatedAt,
        fromTimestamp,
        toTimestamp,
        limit,
      });

      if (results.length) {
        const activities = [];

        for (const result of results) {
          const eventHandler = new AskCancelledEventHandler(
            result.order_id,
            result.event_tx_hash,
            result.event_log_index,
            result.event_batch_index
          );

          const activity = eventHandler.buildDocument(result);

          activities.push(activity);
        }

        await elasticsearch.bulk({
          body: activities.flatMap((activity) => [
            { index: { _index: indexName, _id: activity.id } },
            activity,
          ]),
        });

        const lastResult = results[results.length - 1];

        logger.info(
          this.queueName,
          JSON.stringify({
            topic: "backfill-activities",
            message: `Backfilled ${results.length} activities.`,
            fromTimestamp,
            toTimestamp,
            cursor,
            indexName,
            keepGoing,
            lastResult,
          })
        );

        await this.addToQueue(
          {
            updatedAt: lastResult.updated_ts,
            id: lastResult.order_id,
          },
          fromTimestamp,
          toTimestamp,
          indexName,
          keepGoing
        );
      } else if (keepGoing) {
        logger.info(
          this.queueName,
          JSON.stringify({
            topic: "backfill-activities",
            message: `No new activities.`,
            fromTimestamp,
            toTimestamp,
            cursor,
            indexName,
            keepGoing,
          })
        );

        await this.addToQueue(cursor, fromTimestamp, toTimestamp, indexName, keepGoing);
      } else {
        logger.info(
          this.queueName,
          JSON.stringify({
            topic: "backfill-activities",
            message: `End.`,
            fromTimestamp,
            toTimestamp,
            cursor,
            indexName,
            keepGoing,
          })
        );
      }
    } catch (error) {
      logger.error(
        this.queueName,
        `Backfill error. limit=${limit}, cursor=${JSON.stringify(cursor)}, error=${JSON.stringify(
          error
        )}`
      );
    }
  }

  public async addToQueue(
    cursor?: OrderCursorInfo,
    fromTimestamp?: number,
    toTimestamp?: number,
    indexName?: string,
    keepGoing?: boolean
  ) {
    if (!config.doElasticsearchWork) {
      return;
    }
    await this.send({ payload: { cursor, fromTimestamp, toTimestamp, indexName, keepGoing } });
  }
}

export const backfillAskCancelActivitiesElasticsearchJob =
  new BackfillAskCancelActivitiesElasticsearchJob();
