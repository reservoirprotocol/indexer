import { config } from "@/config/index";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { ridb } from "@/common/db";
import { fromBuffer, toBuffer } from "@/common/utils";
import { elasticsearch } from "@/common/elasticsearch";

import * as ActivitiesIndex from "@/elasticsearch/indexes/activities";

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import {
  EventCursorInfo,
  BackfillBaseActivitiesElasticsearchJobPayload,
} from "@/jobs/activities/backfill/backfill-activities-elasticsearch-job";
import { NftTransferEventCreatedEventHandler } from "@/elasticsearch/indexes/activities/event-handlers/nft-transfer-event-created";

export class BackfillTransferActivitiesElasticsearchJob extends AbstractRabbitMqJobHandler {
  queueName = "backfill-transfer-activities-elasticsearch-queue";
  maxRetries = 10;
  concurrency = 1;
  persistent = true;
  lazyMode = true;

  protected async process(payload: BackfillBaseActivitiesElasticsearchJobPayload) {
    const cursor = payload.cursor as EventCursorInfo;
    const fromTimestamp = payload.fromTimestamp || 0;
    const toTimestamp = payload.toTimestamp || 9999999999;
    const indexName = payload.indexName ?? ActivitiesIndex.getIndexName();
    const keepGoing = payload.keepGoing;
    const limit = Number((await redis.get(`${this.queueName}-limit`)) || 500);

    const fromTimestampISO = new Date(fromTimestamp * 1000).toISOString();
    const toTimestampISO = new Date(toTimestamp * 1000).toISOString();

    try {
      let continuationFilter = "";

      if (cursor) {
        continuationFilter = `AND (timestamp, tx_hash, log_index, batch_index) > ($/timestamp/, $/txHash/, $/logIndex/, $/batchIndex/)`;
      }
      const query = `
            ${NftTransferEventCreatedEventHandler.buildBaseQuery()}
            WHERE  NOT EXISTS (
             SELECT 1
             FROM   fill_events_2 fe
             WHERE  fe.tx_hash = nft_transfer_events.tx_hash
             AND    fe.log_index = nft_transfer_events.log_index
             AND    fe.batch_index = nft_transfer_events.batch_index
             )
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
        const activities = [];

        for (const result of results) {
          const eventHandler = new NftTransferEventCreatedEventHandler(
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
            message: `Backfilled ${
              results.length
            } activities. fromTimestamp=${fromTimestampISO}, toTimestamp=${toTimestampISO}, lastResultTimestamp=${new Date(
              lastResult.event_timestamp * 1000
            ).toISOString()}`,
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
            timestamp: lastResult.event_timestamp,
            txHash: fromBuffer(lastResult.event_tx_hash),
            logIndex: lastResult.event_log_index,
            batchIndex: lastResult.event_batch_index,
          },
          fromTimestamp,
          toTimestamp,
          indexName,
          keepGoing
        );
      } else if (keepGoing) {
        await this.addToQueue(cursor, fromTimestamp, toTimestamp, indexName, keepGoing);
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
    await this.send({ payload: { cursor, fromTimestamp, toTimestamp, indexName, keepGoing } });
  }
}

export const backfillTransferActivitiesElasticsearchJob =
  new BackfillTransferActivitiesElasticsearchJob();
