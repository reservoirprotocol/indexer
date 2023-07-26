import { config } from "@/config/index";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { ridb } from "@/common/db";

import * as ActivitiesIndex from "@/elasticsearch/indexes/activities";

import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import {
  OrderCursorInfo,
  BackfillBaseActivitiesElasticsearchJobPayload,
} from "@/jobs/activities/backfill/backfill-activities-elasticsearch-job";
import { AskCancelledEventHandler } from "@/elasticsearch/indexes/activities/event-handlers/ask-cancelled";
// import { PendingActivitiesQueue } from "@/elasticsearch/indexes/activities/pending-activities-queue";
// import { backfillSavePendingActivitiesElasticsearchJob } from "@/jobs/activities/backfill/backfill-save-pending-activities-elasticsearch-job";
import { RabbitMQMessage } from "@/common/rabbit-mq";
import { elasticsearch } from "@/common/elasticsearch";

export class BackfillAskCancelActivitiesElasticsearchJob extends AbstractRabbitMqJobHandler {
  queueName = "backfill-ask-cancel-activities-elasticsearch-queue";
  maxRetries = 10;
  concurrency = 1;
  persistent = true;
  lazyMode = true;
  backoff = {
    type: "fixed",
    delay: 5000,
  } as BackoffStrategy;

  protected async process(payload: BackfillBaseActivitiesElasticsearchJobPayload) {
    const cursor = payload.cursor as OrderCursorInfo;
    const fromTimestamp = payload.fromTimestamp || 0;
    const toTimestamp = payload.toTimestamp || 9999999999;
    const indexName = payload.indexName ?? ActivitiesIndex.getIndexName();
    const keepGoing = payload.keepGoing;
    const limit = Number((await redis.get(`${this.queueName}-limit`)) || 1000);

    const fromTimestampISO = new Date(fromTimestamp * 1000).toISOString();
    const toTimestampISO = new Date(toTimestamp * 1000).toISOString();

    let addToQueue = false;
    let nextCursor: OrderCursorInfo | undefined;

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
        // const pendingActivitiesQueue = new PendingActivitiesQueue(payload.indexName);

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

        const bulkResponse = await elasticsearch.bulk({
          body: activities.flatMap((activity) => [
            { index: { _index: indexName, _id: activity.id } },
            activity,
          ]),
        });

        // await pendingActivitiesQueue.add(activities);
        // await backfillSavePendingActivitiesElasticsearchJob.addToQueue(indexName);

        const lastResult = results[results.length - 1];

        if (bulkResponse.errors) {
          logger.warn(
            this.queueName,
            JSON.stringify({
              topic: "backfill-activities",
              message: `Backfilled ${
                results.length
              } activities. fromTimestamp=${fromTimestampISO}, toTimestamp=${toTimestampISO}, lastResultTimestamp=${new Date(
                lastResult.updated_ts * 1000
              ).toISOString()}`,
              fromTimestamp,
              toTimestamp,
              cursor,
              indexName,
              keepGoing,
              lastResult,
              errors: bulkResponse.items.filter((item) => item.index?.error),
            })
          );
        } else {
          addToQueue = true;
          nextCursor = {
            updatedAt: lastResult.updated_ts,
            id: lastResult.order_id,
          };

          logger.info(
            this.queueName,
            JSON.stringify({
              topic: "backfill-activities",
              message: `Backfilled ${
                results.length
              } activities. fromTimestamp=${fromTimestampISO}, toTimestamp=${toTimestampISO}, lastResultTimestamp=${new Date(
                lastResult.updated_ts * 1000
              ).toISOString()}`,
              fromTimestamp,
              toTimestamp,
              cursor,
              indexName,
              keepGoing,
              nextCursor,
            })
          );
        }
      } else if (keepGoing) {
        logger.info(
          this.queueName,
          JSON.stringify({
            topic: "backfill-activities",
            message: `KeepGoing. fromTimestamp=${fromTimestampISO}, toTimestamp=${toTimestampISO}`,
            fromTimestamp,
            toTimestamp,
            cursor,
            indexName,
            keepGoing,
          })
        );

        addToQueue = true;
        nextCursor = cursor;
      } else {
        logger.info(
          this.queueName,
          JSON.stringify({
            topic: "backfill-activities",
            message: `End. fromTimestamp=${fromTimestampISO}, toTimestamp=${toTimestampISO}`,
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
        JSON.stringify({
          topic: "backfill-activities",
          message: `Error. fromTimestamp=${fromTimestampISO}, toTimestamp=${toTimestampISO}, error=${error}`,
          fromTimestamp,
          toTimestamp,
          cursor,
          indexName,
          keepGoing,
        })
      );

      throw error;
    }

    return { addToQueue, nextCursor };
  }

  public events() {
    this.once(
      "onCompleted",
      async (
        message: RabbitMQMessage,
        processResult: { addToQueue: boolean; nextCursor?: OrderCursorInfo }
      ) => {
        if (processResult.addToQueue) {
          const payload = message.payload as BackfillBaseActivitiesElasticsearchJobPayload;
          await this.addToQueue(
            processResult.nextCursor,
            payload.fromTimestamp,
            payload.toTimestamp,
            payload.indexName,
            payload.keepGoing
          );
        }
      }
    );
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

    const jobId = `${fromTimestamp}:${toTimestamp}:${keepGoing}:${indexName}`;

    return this.send(
      {
        payload: { cursor, fromTimestamp, toTimestamp, indexName, keepGoing },
        jobId,
      },
      1000
    );
  }
}

export const backfillAskCancelActivitiesElasticsearchJob =
  new BackfillAskCancelActivitiesElasticsearchJob();
