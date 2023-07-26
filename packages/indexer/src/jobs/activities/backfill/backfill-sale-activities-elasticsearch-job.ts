import { config } from "@/config/index";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { ridb } from "@/common/db";
import { fromBuffer, toBuffer } from "@/common/utils";

import * as ActivitiesIndex from "@/elasticsearch/indexes/activities";

import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import {
  EventCursorInfo,
  BackfillBaseActivitiesElasticsearchJobPayload,
} from "@/jobs/activities/backfill/backfill-activities-elasticsearch-job";
import { FillEventCreatedEventHandler } from "@/elasticsearch/indexes/activities/event-handlers/fill-event-created";
// import { PendingActivitiesQueue } from "@/elasticsearch/indexes/activities/pending-activities-queue";
// import { backfillSavePendingActivitiesElasticsearchJob } from "@/jobs/activities/backfill/backfill-save-pending-activities-elasticsearch-job";
import { RabbitMQMessage } from "@/common/rabbit-mq";
import { elasticsearch } from "@/common/elasticsearch";

export class BackfillSaleActivitiesElasticsearchJob extends AbstractRabbitMqJobHandler {
  queueName = "backfill-sale-activities-elasticsearch-queue";
  maxRetries = 10;
  concurrency = 1;
  persistent = true;
  lazyMode = true;
  backoff = {
    type: "fixed",
    delay: 5000,
  } as BackoffStrategy;

  protected async process(payload: BackfillBaseActivitiesElasticsearchJobPayload) {
    const cursor = payload.cursor as EventCursorInfo;
    const fromTimestamp = payload.fromTimestamp || 0;
    const toTimestamp = payload.toTimestamp || 9999999999;
    const indexName = payload.indexName ?? ActivitiesIndex.getIndexName();
    const keepGoing = payload.keepGoing;
    const limit = Number((await redis.get(`${this.queueName}-limit`)) || 1000);

    const fromTimestampISO = new Date(fromTimestamp * 1000).toISOString();
    const toTimestampISO = new Date(toTimestamp * 1000).toISOString();

    let addToQueue = false;
    let nextCursor: EventCursorInfo | undefined;

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
        continuationFilter = `AND (timestamp, tx_hash, log_index, batch_index) > ($/timestamp/, $/txHash/, $/logIndex/, $/batchIndex/)`;
      }

      const query = `
            ${FillEventCreatedEventHandler.buildBaseQuery()}
            WHERE is_deleted = 0
            AND (timestamp >= $/fromTimestamp/ AND timestamp < $/toTimestamp/) 
            ${continuationFilter}
            ORDER BY timestamp, tx_hash, log_index, batch_index
            LIMIT $/limit/;  
          `;

      const results = await ridb.manyOrNone(query, {
        timestamp: cursor?.timestamp || null,
        txHash: cursor?.txHash ? toBuffer(cursor.txHash) : null,
        logIndex: cursor?.logIndex,
        batchIndex: cursor?.batchIndex,
        fromTimestamp,
        toTimestamp,
        limit,
      });

      if (results.length) {
        // const pendingActivitiesQueue = new PendingActivitiesQueue(payload.indexName);

        const activities = [];

        for (const result of results) {
          const eventHandler = new FillEventCreatedEventHandler(
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
            timestamp: lastResult.event_timestamp,
            txHash: fromBuffer(lastResult.event_tx_hash),
            logIndex: lastResult.event_log_index,
            batchIndex: lastResult.event_batch_index,
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
        processResult: { addToQueue: boolean; nextCursor?: EventCursorInfo }
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
    cursor?: EventCursorInfo,
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

export const backfillSaleActivitiesElasticsearchJob = new BackfillSaleActivitiesElasticsearchJob();
