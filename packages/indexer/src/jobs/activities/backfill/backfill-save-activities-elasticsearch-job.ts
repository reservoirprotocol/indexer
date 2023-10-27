import { config } from "@/config/index";
import { logger } from "@/common/logger";
import { ridb } from "@/common/db";

import * as ActivitiesIndex from "@/elasticsearch/indexes/activities";

import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import {
  OrderCursorInfo,
  EventCursorInfo,
} from "@/jobs/activities/backfill/backfill-activities-elasticsearch-job";
import { AskCreatedEventHandler } from "@/elasticsearch/indexes/activities/event-handlers/ask-created";
import { elasticsearch } from "@/common/elasticsearch";
import { AskCancelledEventHandler } from "@/elasticsearch/indexes/activities/event-handlers/ask-cancelled";
import { BidCreatedEventHandler } from "@/elasticsearch/indexes/activities/event-handlers/bid-created";
import { BidCancelledEventHandler } from "@/elasticsearch/indexes/activities/event-handlers/bid-cancelled";
import { FillEventCreatedEventHandler } from "@/elasticsearch/indexes/activities/event-handlers/fill-event-created";
import { fromBuffer, toBuffer } from "@/common/utils";
import { NftTransferEventCreatedEventHandler } from "@/elasticsearch/indexes/activities/event-handlers/nft-transfer-event-created";
import { redis } from "@/common/redis";
import crypto from "crypto";
import { ActivityDocument } from "@/elasticsearch/indexes/activities/base";
import { RabbitMQMessage } from "@/common/rabbit-mq";
// import cron from "node-cron";

export type BackfillSaveActivitiesElasticsearchJobPayload = {
  type: "ask" | "ask-cancel" | "bid" | "bid-cancel" | "sale" | "transfer";
  cursor?: OrderCursorInfo | EventCursorInfo;
  fromTimestamp?: number;
  toTimestamp?: number;
  indexName?: string;
  keepGoing?: boolean;
  upsert?: boolean;
};

export class BackfillSaveActivitiesElasticsearchJob extends AbstractRabbitMqJobHandler {
  queueName = "backfill-save-activities-elasticsearch-queue";
  maxRetries = 10;
  concurrency = 1;
  persistent = true;
  lazyMode = true;
  timeout = 5 * 60 * 1000;

  backoff = {
    type: "fixed",
    delay: 5000,
  } as BackoffStrategy;

  protected async process(payload: BackfillSaveActivitiesElasticsearchJobPayload) {
    const type = payload.type;
    const cursor = payload.cursor;
    const fromTimestamp = payload.fromTimestamp || 0;
    const toTimestamp = payload.toTimestamp || 9999999999;
    const indexName = payload.indexName ?? ActivitiesIndex.getIndexName();
    const keepGoing = payload.keepGoing;
    const upsert = payload.upsert || true;

    const fromTimestampISO = new Date(fromTimestamp * 1000).toISOString();
    const toTimestampISO = new Date(toTimestamp * 1000).toISOString();

    let addToQueue = false;
    let addToQueueCursor: OrderCursorInfo | EventCursorInfo | undefined;

    const limit = Number(await redis.get(`${this.queueName}-limit`)) || 1000;

    const jobId = crypto
      .createHash("sha256")
      .update(
        `${type}:${JSON.stringify(cursor)}${fromTimestamp}:${toTimestamp}:${indexName}:${keepGoing}`
      )
      .digest("hex");

    try {
      const { activities, nextCursor } = await getActivities(
        type,
        fromTimestamp,
        toTimestamp,
        cursor,
        limit
      );

      if (activities.length) {
        if (activities.length === limit || keepGoing) {
          addToQueue = true;
          addToQueueCursor = nextCursor;
        }

        const bulkResponse = await elasticsearch.bulk({
          body: activities.flatMap((activity) => [
            { [upsert ? "index" : "create"]: { _index: indexName, _id: activity.id } },
            activity,
          ]),
        });

        let errorActivities: ActivityDocument[] = [];

        if (bulkResponse.errors) {
          const errorItems = bulkResponse.items.filter((item) => item.index?.error);
          const errorItemsIds = errorItems.map((item) => item.index?._id);
          errorActivities = activities.filter((activity) => errorItemsIds.includes(activity.id));
        }

        logger.info(
          this.queueName,
          JSON.stringify({
            topic: "backfill-activities",
            message: `Backfilled ${activities.length} activities. type=${type}, fromTimestamp=${fromTimestampISO}, toTimestamp=${toTimestampISO}, keepGoing=${keepGoing}, limit=${limit}`,
            type,
            fromTimestamp,
            fromTimestampISO,
            toTimestamp,
            toTimestampISO,
            cursor,
            indexName,
            keepGoing,
            jobId,
            nextCursor,
            hasNextCursor: !!nextCursor,
            hasErrors: bulkResponse.errors,
            errorItems: bulkResponse.items.filter((item) => item.index?.error),
            errorActivities,
            payloadJSON: JSON.stringify(payload),
          })
        );
      } else if (keepGoing) {
        logger.info(
          this.queueName,
          JSON.stringify({
            topic: "backfill-activities",
            message: `KeepGoing. type=${type}, fromTimestamp=${fromTimestampISO}, toTimestamp=${toTimestampISO}, limit=${limit}`,
            type,
            fromTimestamp,
            fromTimestampISO,
            toTimestamp,
            toTimestampISO,
            cursor,
            indexName,
            keepGoing,
            jobId,
          })
        );

        addToQueue = true;
        addToQueueCursor = cursor;
      }
    } catch (error) {
      logger.error(
        this.queueName,
        JSON.stringify({
          topic: "backfill-activities",
          message: `Error. type=${type}, fromTimestamp=${fromTimestampISO}, toTimestamp=${toTimestampISO}, keepGoing=${keepGoing}, error=${error}`,
          type,
          fromTimestamp,
          fromTimestampISO,
          toTimestamp,
          toTimestampISO,
          cursor,
          indexName,
          keepGoing,
          jobId,
          payloadJSON: JSON.stringify(payload),
        })
      );

      throw error;
    }

    if (!addToQueue) {
      logger.info(
        this.queueName,
        JSON.stringify({
          topic: "backfill-activities",
          message: `End. type=${type}, fromTimestamp=${fromTimestampISO}, toTimestamp=${toTimestampISO}, keepGoing=${keepGoing}, limit=${limit}`,
          type,
          fromTimestamp,
          fromTimestampISO,
          toTimestamp,
          toTimestampISO,
          cursor,
          indexName,
          keepGoing,
          jobId,
        })
      );
    }

    return { addToQueue, addToQueueCursor };
  }

  public async onCompleted(
    rabbitMqMessage: RabbitMQMessage,
    processResult: {
      addToQueue: boolean;
      addToQueueCursor: OrderCursorInfo | EventCursorInfo | undefined;
    }
  ) {
    if (processResult.addToQueue) {
      await this.addToQueue(
        rabbitMqMessage.payload.type,
        processResult.addToQueueCursor,
        rabbitMqMessage.payload.fromTimestamp,
        rabbitMqMessage.payload.toTimestamp,
        rabbitMqMessage.payload.indexName,
        rabbitMqMessage.payload.keepGoing
      );
    }
  }

  public async addToQueue(
    type: "ask" | "ask-cancel" | "bid" | "bid-cancel" | "sale" | "transfer",
    cursor?: OrderCursorInfo | EventCursorInfo,
    fromTimestamp?: number,
    toTimestamp?: number,
    indexName?: string,
    keepGoing?: boolean
  ) {
    if (!config.doElasticsearchWork) {
      return;
    }

    const jobId = crypto
      .createHash("sha256")
      .update(
        `${type}:${JSON.stringify(cursor)}${fromTimestamp}:${toTimestamp}:${indexName}:${keepGoing}`
      )
      .digest("hex");

    return this.send(
      {
        payload: { type, cursor, fromTimestamp, toTimestamp, indexName, keepGoing },
        jobId,
      },
      1000
    );
  }
}

export const backfillSaveActivitiesElasticsearchJob = new BackfillSaveActivitiesElasticsearchJob();

const getActivities = async (
  type: string,
  fromTimestamp: number,
  toTimestamp: number,
  cursor?: OrderCursorInfo | EventCursorInfo,
  limit = 1000
) => {
  switch (type) {
    case "ask":
      return getAskActivities(fromTimestamp, toTimestamp, cursor as OrderCursorInfo, limit);
    case "ask-cancel":
      return getAskCancelActivities(fromTimestamp, toTimestamp, cursor as OrderCursorInfo, limit);
    case "bid":
      return getBidActivities(fromTimestamp, toTimestamp, cursor as OrderCursorInfo, limit);
    case "bid-cancel":
      return getBidCancelActivities(fromTimestamp, toTimestamp, cursor as OrderCursorInfo, limit);
    case "sale":
      return getSaleActivities(fromTimestamp, toTimestamp, cursor as EventCursorInfo, limit);
    case "transfer":
      return getTransferActivities(fromTimestamp, toTimestamp, cursor as EventCursorInfo, limit);
    default:
      throw new Error("Unknown type!");
  }
};
const getAskActivities = async (
  fromTimestamp: number,
  toTimestamp: number,
  cursor?: OrderCursorInfo,
  limit = 1000
) => {
  const activities = [];
  let nextCursor: OrderCursorInfo | undefined;

  let continuationFilter = "";

  if (cursor) {
    continuationFilter = `AND (updated_at, id) > (to_timestamp($/updatedAt/), $/id/)`;
  }

  const timestampFilter = `AND (updated_at >= to_timestamp($/fromTimestamp/) AND updated_at < to_timestamp($/toTimestamp/))`;

  const query = `
            ${AskCreatedEventHandler.buildBaseQuery()}
            WHERE side = 'sell'
            AND kind != 'element-erc1155'
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
    for (const result of results) {
      const eventHandler = new AskCreatedEventHandler(
        result.order_id,
        result.event_tx_hash,
        result.event_log_index,
        result.event_batch_index
      );

      const activity = eventHandler.buildDocument(result);

      activities.push(activity);
    }

    const lastResult = results[results.length - 1];

    nextCursor = {
      updatedAt: lastResult.updated_ts,
      id: lastResult.order_id,
    };
  }

  return { activities, nextCursor };
};

const getAskCancelActivities = async (
  fromTimestamp: number,
  toTimestamp: number,
  cursor?: OrderCursorInfo,
  limit = 1000
) => {
  const activities = [];
  let nextCursor: OrderCursorInfo | undefined;

  let continuationFilter = "";

  if (cursor) {
    continuationFilter = `AND (updated_at, id) > (to_timestamp($/updatedAt/), $/id/)`;
  }

  const timestampFilter = `AND (updated_at >= to_timestamp($/fromTimestamp/) AND updated_at < to_timestamp($/toTimestamp/))`;

  const query = `
            ${AskCancelledEventHandler.buildBaseQuery()}
            WHERE side = 'sell' AND fillability_status = 'cancelled'
            AND kind != 'element-erc1155'
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

    const lastResult = results[results.length - 1];

    nextCursor = {
      updatedAt: lastResult.updated_ts,
      id: lastResult.order_id,
    };
  }

  return { activities, nextCursor };
};

const getBidActivities = async (
  fromTimestamp: number,
  toTimestamp: number,
  cursor?: OrderCursorInfo,
  limit = 1000
) => {
  const activities = [];
  let nextCursor: OrderCursorInfo | undefined;

  let continuationFilter = "";

  if (cursor) {
    continuationFilter = `AND (updated_at, id) > (to_timestamp($/updatedAt/), $/id/)`;
  }

  const timestampFilter = `AND (updated_at >= to_timestamp($/fromTimestamp/) AND updated_at < to_timestamp($/toTimestamp/))`;

  const query = `
            ${BidCreatedEventHandler.buildBaseQuery()}
            WHERE side = 'buy'
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
    for (const result of results) {
      const eventHandler = new BidCreatedEventHandler(
        result.order_id,
        result.event_tx_hash,
        result.event_log_index,
        result.event_batch_index
      );

      const activity = eventHandler.buildDocument(result);

      activities.push(activity);
    }

    const lastResult = results[results.length - 1];

    nextCursor = {
      updatedAt: lastResult.updated_ts,
      id: lastResult.order_id,
    };
  }

  return { activities, nextCursor };
};

const getBidCancelActivities = async (
  fromTimestamp: number,
  toTimestamp: number,
  cursor?: OrderCursorInfo,
  limit = 1000
) => {
  const activities = [];
  let nextCursor: OrderCursorInfo | undefined;

  let continuationFilter = "";

  if (cursor) {
    continuationFilter = `AND (updated_at, id) > (to_timestamp($/updatedAt/), $/id/)`;
  }

  const timestampFilter = `AND (updated_at >= to_timestamp($/fromTimestamp/) AND updated_at < to_timestamp($/toTimestamp/))`;

  const query = `
            ${BidCancelledEventHandler.buildBaseQuery()}
            WHERE side = 'buy' AND fillability_status = 'cancelled'
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
    for (const result of results) {
      const eventHandler = new BidCancelledEventHandler(
        result.order_id,
        result.event_tx_hash,
        result.event_log_index,
        result.event_batch_index
      );

      const activity = eventHandler.buildDocument(result);

      activities.push(activity);
    }

    const lastResult = results[results.length - 1];

    nextCursor = {
      updatedAt: lastResult.updated_ts,
      id: lastResult.order_id,
    };
  }

  return { activities, nextCursor };
};

const getSaleActivities = async (
  fromTimestamp: number,
  toTimestamp: number,
  cursor?: EventCursorInfo,
  limit = 1000
) => {
  const activities = [];
  let nextCursor: EventCursorInfo | undefined;

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
    for (const result of results) {
      const eventHandler = new FillEventCreatedEventHandler(
        result.event_tx_hash,
        result.event_log_index,
        result.event_batch_index
      );

      const activity = eventHandler.buildDocument(result);

      activities.push(activity);
    }

    const lastResult = results[results.length - 1];

    nextCursor = {
      timestamp: lastResult.event_timestamp,
      txHash: fromBuffer(lastResult.event_tx_hash),
      logIndex: lastResult.event_log_index,
      batchIndex: lastResult.event_batch_index,
    };
  }

  return { activities, nextCursor };
};

const getTransferActivities = async (
  fromTimestamp: number,
  toTimestamp: number,
  cursor?: EventCursorInfo,
  limit = 1000
) => {
  const activities = [];
  let nextCursor: EventCursorInfo | undefined;

  let continuationFilter = "";

  if (cursor) {
    continuationFilter = `AND (timestamp, tx_hash, log_index, batch_index) > ($/timestamp/, $/txHash/, $/logIndex/, $/batchIndex/)`;
  }

  const query = `
            ${NftTransferEventCreatedEventHandler.buildBaseQuery()}
            WHERE NOT EXISTS (
             SELECT 1
             FROM   fill_events_2 fe
             WHERE  fe.tx_hash = nft_transfer_events.tx_hash
             AND    fe.log_index = nft_transfer_events.log_index
             AND    fe.batch_index = nft_transfer_events.batch_index
             )
            AND (timestamp >= $/fromTimestamp/ AND timestamp < $/toTimestamp/) 
            AND is_deleted = 0
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
    for (const result of results) {
      const eventHandler = new NftTransferEventCreatedEventHandler(
        result.event_tx_hash,
        result.event_log_index,
        result.event_batch_index
      );

      const activity = eventHandler.buildDocument(result);

      activities.push(activity);
    }

    const lastResult = results[results.length - 1];

    nextCursor = {
      timestamp: lastResult.event_timestamp,
      txHash: fromBuffer(lastResult.event_tx_hash),
      logIndex: lastResult.event_log_index,
      batchIndex: lastResult.event_batch_index,
    };
  }

  return { activities, nextCursor };
};

// if (config.doBackgroundWork && config.doElasticsearchWork) {
//   cron.schedule(
//     "*/5 * * * *",
//     async () =>
//       await redlock
//         .acquire(["backfill-activities-lock"], (5 * 60 - 5) * 1000)
//         .then(async () => {
//           const lastRunsJson = await redis.hgetall(
//             `${backfillSaveActivitiesElasticsearchJob.queueName}-last-run`
//           );
//
//           for (const lastRunType in lastRunsJson) {
//             const lastRunTimestamp = new Date(lastRunsJson[lastRunType]);
//             const lastRunDelay = new Date().getTime() - lastRunTimestamp.getTime() > 5 * 60 * 1000;
//
//             logger.info(
//               backfillSaveActivitiesElasticsearchJob.queueName,
//               JSON.stringify({
//                 topic: "backfill-activities",
//                 message: `Delay check! type=${lastRunType}, delay=${lastRunDelay}`,
//               })
//             );
//
//             if (lastRunDelay) {
//               const payloadJson = await redis.hget(
//                 `${backfillSaveActivitiesElasticsearchJob.queueName}-last-payload`,
//                 lastRunType
//               );
//
//               if (payloadJson) {
//                 const payload = JSON.parse(payloadJson);
//
//                 await backfillSaveActivitiesElasticsearchJob.addToQueue(
//                   lastRunType as "ask" | "ask-cancel" | "bid" | "bid-cancel" | "sale" | "transfer",
//                   payload.cursor ?? undefined,
//                   payload.fromTimestamp,
//                   payload.toTimestamp,
//                   payload.indexName
//                 );
//
//                 logger.info(
//                   backfillSaveActivitiesElasticsearchJob.queueName,
//                   JSON.stringify({
//                     topic: "backfill-activities",
//                     message: `Backfill delayed, retriggering! type=${lastRunType}`,
//                     payload,
//                   })
//                 );
//               }
//             }
//           }
//         })
//         .catch((error) => {
//           logger.error(
//             backfillSaveActivitiesElasticsearchJob.queueName,
//             JSON.stringify({
//               topic: "backfill-activities",
//               message: `cron error. error=${error}`,
//               error,
//             })
//           );
//         })
//   );
// }
