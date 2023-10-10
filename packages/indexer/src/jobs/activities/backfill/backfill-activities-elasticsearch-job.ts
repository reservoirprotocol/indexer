import { config } from "@/config/index";
import { logger } from "@/common/logger";
import { ridb } from "@/common/db";
import { elasticsearch } from "@/common/elasticsearch";
import { redis } from "@/common/redis";

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";

import { backfillSaveActivitiesElasticsearchJob } from "@/jobs/activities/backfill/backfill-save-activities-elasticsearch-job";

import * as CONFIG from "@/elasticsearch/indexes/activities/config";
import { getNetworkName } from "@/config/network";
import * as ActivitiesIndex from "@/elasticsearch/indexes/activities";

export class BackfillActivitiesElasticsearchJob extends AbstractRabbitMqJobHandler {
  queueName = "backfill-activities-elasticsearch-queue";
  maxRetries = 10;
  concurrency = 1;
  persistent = true;
  lazyMode = true;

  protected async process(payload: BackfillActivitiesElasticsearchJobPayload) {
    logger.info(
      this.queueName,
      JSON.stringify({
        topic: "backfill-activities",
        message: `Start.`,
        payload,
      })
    );

    const { createIndex, indexConfig, keepGoing, fromLastBackfill } = payload;

    let indexName: string;

    if (createIndex) {
      if (payload.indexName) {
        indexName = `${getNetworkName()}.${payload.indexName}`;
      } else {
        indexName = `${ActivitiesIndex.getIndexName()}-${Date.now()}`;
      }

      const params = {
        index: indexName,
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        ...CONFIG[indexConfig!],
      };

      const createIndexResponse = await elasticsearch.indices.create(params);

      logger.info(
        this.queueName,
        JSON.stringify({
          topic: "backfill-activities",
          message: "Index Created!",
          params,
          createIndexResponse,
        })
      );
    } else {
      if (payload.indexName) {
        indexName = `${getNetworkName()}.${payload.indexName}`;
      } else {
        indexName = ActivitiesIndex.getIndexName();
      }
    }

    const promises = [];

    const backfillTransferActivities = async (fromLastBackfill?: boolean) => {
      if (fromLastBackfill) {
        const payloadJson = await redis.hget(
          `${backfillSaveActivitiesElasticsearchJob.queueName}-last-payload`,
          "transfer"
        );

        if (payloadJson) {
          const payload = JSON.parse(payloadJson);

          await backfillSaveActivitiesElasticsearchJob.addToQueue(
            "transfer",
            payload.cursor ?? undefined,
            payload.fromTimestamp,
            payload.toTimestamp,
            indexName
          );

          logger.info(
            this.queueName,
            JSON.stringify({
              topic: "backfill-activities",
              message: `from Last Back fill! transfer`,
              indexName,
              payload,
            })
          );
        }
      } else {
        const query =
          "SELECT min(timestamp) AS min_timestamp, MAX(timestamp) AS max_timestamp from nft_transfer_events where is_deleted = 0;";

        const timestamps = await ridb.oneOrNone(query);
        const startTimestamp = payload.fromTimestamp || timestamps.min_timestamp;
        const endTimestamp = timestamps.max_timestamp;

        await backfillSaveActivitiesElasticsearchJob.addToQueue(
          "transfer",
          undefined,
          startTimestamp,
          endTimestamp,
          indexName
        );

        if (keepGoing) {
          await backfillSaveActivitiesElasticsearchJob.addToQueue(
            "transfer",
            undefined,
            endTimestamp,
            undefined,
            indexName,
            true
          );
        }
      }
    };

    const backfillSaleActivities = async (fromLastBackfill?: boolean) => {
      if (fromLastBackfill) {
        const payloadJson = await redis.hget(
          `${backfillSaveActivitiesElasticsearchJob.queueName}-last-payload`,
          "sale"
        );

        if (payloadJson) {
          const payload = JSON.parse(payloadJson);

          await backfillSaveActivitiesElasticsearchJob.addToQueue(
            "sale",
            payload.cursor ?? undefined,
            payload.fromTimestamp,
            payload.toTimestamp,
            indexName
          );

          logger.info(
            this.queueName,
            JSON.stringify({
              topic: "backfill-activities",
              message: `from Last Back fill! sale`,
              indexName,
              payload,
            })
          );
        }
      } else {
        const query =
          "SELECT min(timestamp) AS min_timestamp, MAX(timestamp) AS max_timestamp from fill_events_2 where is_deleted = 0;";

        const timestamps = await ridb.oneOrNone(query);
        const fromTimestamp = payload.fromTimestamp || timestamps.min_timestamp;
        const endTimestamp = timestamps.max_timestamp;

        await backfillSaveActivitiesElasticsearchJob.addToQueue(
          "sale",
          undefined,
          fromTimestamp,
          endTimestamp,
          indexName
        );

        if (keepGoing) {
          // const fromTimestamp = Math.floor(end.getTime() / 1000);

          await backfillSaveActivitiesElasticsearchJob.addToQueue(
            "sale",
            undefined,
            fromTimestamp,
            undefined,
            indexName,
            true
          );
        }
      }
    };

    const backfillAskActivities = async (fromLastBackfill?: boolean) => {
      if (fromLastBackfill) {
        const payloadJson = await redis.hget(
          `${backfillSaveActivitiesElasticsearchJob.queueName}-last-payload`,
          "ask"
        );

        if (payloadJson) {
          const payload = JSON.parse(payloadJson);

          await backfillSaveActivitiesElasticsearchJob.addToQueue(
            "ask",
            payload.cursor ?? undefined,
            payload.fromTimestamp,
            payload.toTimestamp,
            indexName
          );

          logger.info(
            this.queueName,
            JSON.stringify({
              topic: "backfill-activities",
              message: `from Last Back fill! ask`,
              indexName,
              payload,
            })
          );
        }
      } else {
        const query =
          "SELECT extract(epoch from min(updated_at)) AS min_timestamp, extract(epoch from max(updated_at)) AS max_timestamp from orders WHERE side = 'sell';";

        const timestamps = await ridb.oneOrNone(query);
        const fromTimestamp = payload.fromTimestamp || timestamps.min_timestamp;
        const endTimestamp = timestamps.max_timestamp;

        await backfillSaveActivitiesElasticsearchJob.addToQueue(
          "ask",
          undefined,
          fromTimestamp,
          endTimestamp,
          indexName
        );

        if (keepGoing) {
          // const fromTimestamp = Math.floor(end.getTime() / 1000);

          await backfillSaveActivitiesElasticsearchJob.addToQueue(
            "ask",
            undefined,
            fromTimestamp,
            undefined,
            indexName,
            true
          );
        }
      }
    };

    const backfillAskCancelActivities = async (fromLastBackfill?: boolean) => {
      if (fromLastBackfill) {
        const payloadJson = await redis.hget(
          `${backfillSaveActivitiesElasticsearchJob.queueName}-last-payload`,
          "ask-cancel"
        );

        if (payloadJson) {
          const payload = JSON.parse(payloadJson);

          await backfillSaveActivitiesElasticsearchJob.addToQueue(
            "ask-cancel",
            payload.cursor ?? undefined,
            payload.fromTimestamp,
            payload.toTimestamp,
            indexName
          );

          logger.info(
            this.queueName,
            JSON.stringify({
              topic: "backfill-activities",
              message: `from Last Back fill! ask-cancel`,
              indexName,
              payload,
            })
          );
        }
      } else {
        const query =
          "SELECT extract(epoch from min(updated_at)) AS min_timestamp, extract(epoch from max(updated_at)) AS max_timestamp from orders WHERE side = 'sell' AND fillability_status = 'cancelled';";

        const timestamps = await ridb.oneOrNone(query);
        const fromTimestamp = payload.fromTimestamp || timestamps.min_timestamp;
        const endTimestamp = timestamps.max_timestamp;

        await backfillSaveActivitiesElasticsearchJob.addToQueue(
          "ask-cancel",
          undefined,
          fromTimestamp,
          endTimestamp,
          indexName
        );

        if (keepGoing) {
          // const fromTimestamp = Math.floor(end.getTime() / 1000);

          await backfillSaveActivitiesElasticsearchJob.addToQueue(
            "ask-cancel",
            undefined,
            fromTimestamp,
            undefined,
            indexName,
            true
          );
        }
      }
    };

    const backfillBidActivities = async (fromLastBackfill?: boolean) => {
      if (fromLastBackfill) {
        const payloadJson = await redis.hget(
          `${backfillSaveActivitiesElasticsearchJob.queueName}-last-payload`,
          "bid"
        );

        if (payloadJson) {
          const payload = JSON.parse(payloadJson);

          await backfillSaveActivitiesElasticsearchJob.addToQueue(
            "bid",
            payload.cursor ?? undefined,
            payload.fromTimestamp,
            payload.toTimestamp,
            indexName
          );

          logger.info(
            this.queueName,
            JSON.stringify({
              topic: "backfill-activities",
              message: `from Last Back fill! bid`,
              indexName,
              payload,
            })
          );
        }
      } else {
        const query =
          "SELECT extract(epoch from min(updated_at)) AS min_timestamp, extract(epoch from max(updated_at)) AS max_timestamp from orders WHERE side = 'buy';";

        const timestamps = await ridb.oneOrNone(query);
        const fromTimestamp = payload.fromTimestamp || timestamps.min_timestamp;
        const endTimestamp = timestamps.max_timestamp;

        await backfillSaveActivitiesElasticsearchJob.addToQueue(
          "bid",
          undefined,
          fromTimestamp,
          endTimestamp,
          indexName
        );

        if (keepGoing) {
          // const fromTimestamp = Math.floor(end.getTime() / 1000);

          await backfillSaveActivitiesElasticsearchJob.addToQueue(
            "bid",
            undefined,
            fromTimestamp,
            undefined,
            indexName,
            true
          );
        }
      }
    };

    const backfillBidCancelActivities = async (fromLastBackfill?: boolean) => {
      if (fromLastBackfill) {
        const payloadJson = await redis.hget(
          `${backfillSaveActivitiesElasticsearchJob.queueName}-last-payload`,
          "bid-cancel"
        );

        if (payloadJson) {
          const payload = JSON.parse(payloadJson);

          await backfillSaveActivitiesElasticsearchJob.addToQueue(
            "bid-cancel",
            payload.cursor ?? undefined,
            payload.fromTimestamp,
            payload.toTimestamp,
            indexName
          );

          logger.info(
            this.queueName,
            JSON.stringify({
              topic: "backfill-activities",
              message: `from Last Back fill! bid-cancel`,
              indexName,
              payload,
            })
          );
        }
      } else {
        const query =
          "SELECT extract(epoch from min(updated_at)) AS min_timestamp, extract(epoch from max(updated_at)) AS max_timestamp from orders WHERE side = 'buy' AND fillability_status = 'cancelled';";

        const timestamps = await ridb.oneOrNone(query);
        const fromTimestamp = payload.fromTimestamp || timestamps.min_timestamp;
        const endTimestamp = timestamps.max_timestamp;

        await backfillSaveActivitiesElasticsearchJob.addToQueue(
          "bid-cancel",
          undefined,
          fromTimestamp,
          endTimestamp,
          indexName
        );

        if (keepGoing) {
          // const fromTimestamp = Math.floor(end.getTime() / 1000);

          await backfillSaveActivitiesElasticsearchJob.addToQueue(
            "bid-cancel",
            undefined,
            fromTimestamp,
            undefined,
            indexName,
            true
          );
        }
      }
    };

    if (payload.backfillTransferActivities) {
      promises.push(backfillTransferActivities(fromLastBackfill));
    }

    if (payload.backfillSaleActivities) {
      promises.push(backfillSaleActivities(fromLastBackfill));
    }

    if (payload.backfillAskActivities) {
      promises.push(backfillAskActivities(fromLastBackfill));
    }

    if (payload.backfillAskCancelActivities) {
      promises.push(backfillAskCancelActivities(fromLastBackfill));
    }

    if (payload.backfillBidActivities) {
      promises.push(backfillBidActivities(fromLastBackfill));
    }

    if (payload.backfillBidCancelActivities) {
      promises.push(backfillBidCancelActivities(fromLastBackfill));
    }

    await Promise.all(promises);
  }

  public async addToQueue(
    createIndex = false,
    indexName = "",
    indexConfig = "",
    keepGoing = false,
    backfillTransferActivities = true,
    backfillSaleActivities = true,
    backfillAskActivities = true,
    backfillAskCancelActivities = true,
    backfillBidActivities = true,
    backfillBidCancelActivities = true,
    fromTimestamp?: number,
    fromLastBackfill?: boolean
  ) {
    if (!config.doElasticsearchWork) {
      return;
    }
    await this.send({
      payload: {
        createIndex,
        indexName,
        indexConfig,
        keepGoing,
        backfillTransferActivities,
        backfillSaleActivities,
        backfillAskActivities,
        backfillAskCancelActivities,
        backfillBidActivities,
        backfillBidCancelActivities,
        fromTimestamp,
        fromLastBackfill,
      },
    });
  }
}

export const backfillActivitiesElasticsearchJob = new BackfillActivitiesElasticsearchJob();

export type BackfillActivitiesElasticsearchJobPayload = {
  createIndex?: boolean;
  indexName?: string;
  indexConfig?: string;
  keepGoing?: boolean;
  backfillTransferActivities?: boolean;
  backfillSaleActivities?: boolean;
  backfillAskActivities?: boolean;
  backfillAskCancelActivities?: boolean;
  backfillBidActivities?: boolean;
  backfillBidCancelActivities?: boolean;
  fromTimestamp?: number;
  fromLastBackfill?: boolean;
};

export type BackfillBaseActivitiesElasticsearchJobPayload = {
  cursor?: OrderCursorInfo | EventCursorInfo;
  fromTimestamp?: number;
  toTimestamp?: number;
  indexName?: string;
  keepGoing?: boolean;
};

export interface OrderCursorInfo {
  updatedAt: string;
  id: string;
}

export interface EventCursorInfo {
  timestamp: string;
  txHash: string;
  logIndex: number;
  batchIndex: string;
}
