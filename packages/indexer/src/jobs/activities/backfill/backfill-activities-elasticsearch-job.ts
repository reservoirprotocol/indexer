import { config } from "@/config/index";
import { logger } from "@/common/logger";
import { ridb } from "@/common/db";
import { elasticsearch } from "@/common/elasticsearch";
import { redlock } from "@/common/redis";

import * as ActivitiesIndex from "@/elasticsearch/indexes/activities";
import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";

import { backfillSaveActivitiesElasticsearchJob } from "@/jobs/activities/backfill/backfill-save-activities-elasticsearch-job";

import * as CONFIG from "@/elasticsearch/indexes/activities/config";

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

    const { createIndex, indexName, indexConfig, keepGoing } = payload;

    if (createIndex) {
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
    }

    const promises = [];

    const backfillTransferActivities = async () => {
      const query =
        "SELECT min(timestamp) AS min_timestamp, MAX(timestamp) AS max_timestamp from nft_transfer_events;";

      const timestamps = await ridb.oneOrNone(query);

      const start = new Date(timestamps.min_timestamp * 1000);
      const end = new Date(timestamps.max_timestamp * 1000);

      let loop = new Date(start);

      while (loop <= end) {
        const fromTimestamp = Math.floor(loop.getTime() / 1000);
        const newDate = loop.setDate(loop.getDate() + 1);
        const toTimestamp = Math.floor(newDate / 1000);

        await backfillSaveActivitiesElasticsearchJob.addToQueue(
          "transfer",
          undefined,
          fromTimestamp,
          toTimestamp,
          indexName
        );

        loop = new Date(newDate);
      }

      if (keepGoing) {
        const fromTimestamp = Math.floor(end.getTime() / 1000);

        await backfillSaveActivitiesElasticsearchJob.addToQueue(
          "transfer",
          undefined,
          fromTimestamp,
          undefined,
          indexName,
          true
        );
      }
    };

    const backfillSaleActivities = async () => {
      const query =
        "SELECT min(timestamp) AS min_timestamp, MAX(timestamp) AS max_timestamp from fill_events_2;";

      const timestamps = await ridb.oneOrNone(query);

      const start = new Date(timestamps.min_timestamp * 1000);
      const end = new Date(timestamps.max_timestamp * 1000);

      let loop = new Date(start);

      while (loop <= end) {
        const fromTimestamp = Math.floor(loop.getTime() / 1000);
        const newDate = loop.setDate(loop.getDate() + 1);
        const toTimestamp = Math.floor(newDate / 1000);

        await backfillSaveActivitiesElasticsearchJob.addToQueue(
          "sale",
          undefined,
          fromTimestamp,
          toTimestamp,
          indexName
        );

        loop = new Date(newDate);
      }

      if (keepGoing) {
        const fromTimestamp = Math.floor(end.getTime() / 1000);

        await backfillSaveActivitiesElasticsearchJob.addToQueue(
          "sale",
          undefined,
          fromTimestamp,
          undefined,
          indexName,
          true
        );
      }
    };

    const backfillAskActivities = async () => {
      const query =
        "SELECT extract(epoch from min(updated_at)) AS min_timestamp, extract(epoch from max(updated_at)) AS max_timestamp from orders WHERE side = 'sell';";

      const timestamps = await ridb.oneOrNone(query);

      const start = new Date(timestamps.min_timestamp * 1000);
      const end = new Date(timestamps.max_timestamp * 1000);

      let loop = new Date(start);

      while (loop <= end) {
        const fromTimestamp = Math.floor(loop.getTime() / 1000);
        const newDate = loop.setDate(loop.getDate() + 1);
        const toTimestamp = Math.floor(newDate / 1000);

        await backfillSaveActivitiesElasticsearchJob.addToQueue(
          "ask",
          undefined,
          fromTimestamp,
          toTimestamp,
          indexName
        );

        loop = new Date(newDate);
      }

      if (keepGoing) {
        const fromTimestamp = Math.floor(end.getTime() / 1000);

        await backfillSaveActivitiesElasticsearchJob.addToQueue(
          "ask",
          undefined,
          fromTimestamp,
          undefined,
          indexName,
          true
        );
      }
    };

    const backfillAskCancelActivities = async () => {
      const query =
        "SELECT extract(epoch from min(updated_at)) AS min_timestamp, extract(epoch from max(updated_at)) AS max_timestamp from orders WHERE side = 'sell' AND fillability_status = 'cancelled';";

      const timestamps = await ridb.oneOrNone(query);

      const start = new Date(timestamps.min_timestamp * 1000);
      const end = new Date(timestamps.max_timestamp * 1000);

      let loop = new Date(start);

      while (loop <= end) {
        const fromTimestamp = Math.floor(loop.getTime() / 1000);
        const newDate = loop.setDate(loop.getDate() + 1);
        const toTimestamp = Math.floor(newDate / 1000);

        await backfillSaveActivitiesElasticsearchJob.addToQueue(
          "ask-cancel",
          undefined,
          fromTimestamp,
          toTimestamp,
          indexName
        );

        loop = new Date(newDate);
      }

      if (keepGoing) {
        const fromTimestamp = Math.floor(end.getTime() / 1000);

        await backfillSaveActivitiesElasticsearchJob.addToQueue(
          "ask-cancel",
          undefined,
          fromTimestamp,
          undefined,
          indexName,
          true
        );
      }
    };

    const backfillBidActivities = async () => {
      const query =
        "SELECT extract(epoch from min(updated_at)) AS min_timestamp, extract(epoch from max(updated_at)) AS max_timestamp from orders WHERE side = 'buy';";

      const timestamps = await ridb.oneOrNone(query);

      const start = new Date(timestamps.min_timestamp * 1000);
      const end = new Date(timestamps.max_timestamp * 1000);

      let loop = new Date(start);

      while (loop <= end) {
        const fromTimestamp = Math.floor(loop.getTime() / 1000);
        const newDate = loop.setDate(loop.getDate() + 1);
        const toTimestamp = Math.floor(newDate / 1000);

        await backfillSaveActivitiesElasticsearchJob.addToQueue(
          "bid",
          undefined,
          fromTimestamp,
          toTimestamp,
          indexName
        );

        loop = new Date(newDate);
      }

      if (keepGoing) {
        const fromTimestamp = Math.floor(end.getTime() / 1000);

        await backfillSaveActivitiesElasticsearchJob.addToQueue(
          "bid",
          undefined,
          fromTimestamp,
          undefined,
          indexName,
          true
        );
      }
    };

    const backfillBidCancelActivities = async () => {
      const query =
        "SELECT extract(epoch from min(updated_at)) AS min_timestamp, extract(epoch from max(updated_at)) AS max_timestamp from orders WHERE side = 'buy' AND fillability_status = 'cancelled';";

      const timestamps = await ridb.oneOrNone(query);

      const start = new Date(timestamps.min_timestamp * 1000);
      const end = new Date(timestamps.max_timestamp * 1000);

      let loop = new Date(start);

      while (loop <= end) {
        const fromTimestamp = Math.floor(loop.getTime() / 1000);
        const newDate = loop.setDate(loop.getDate() + 1);
        const toTimestamp = Math.floor(newDate / 1000);

        await backfillSaveActivitiesElasticsearchJob.addToQueue(
          "bid-cancel",
          undefined,
          fromTimestamp,
          toTimestamp,
          indexName
        );

        loop = new Date(newDate);
      }

      if (keepGoing) {
        const fromTimestamp = Math.floor(end.getTime() / 1000);

        await backfillSaveActivitiesElasticsearchJob.addToQueue(
          "bid-cancel",
          undefined,
          fromTimestamp,
          undefined,
          indexName,
          true
        );
      }
    };

    if (payload.backfillTransferActivities) {
      promises.push(backfillTransferActivities());
    }

    if (payload.backfillSaleActivities) {
      promises.push(backfillSaleActivities());
    }

    if (payload.backfillTransferActivities) {
      promises.push(backfillTransferActivities());
    }

    if (payload.backfillAskActivities) {
      promises.push(backfillAskActivities());
    }

    if (payload.backfillAskCancelActivities) {
      promises.push(backfillAskCancelActivities());
    }

    if (payload.backfillBidActivities) {
      promises.push(backfillBidActivities());
    }

    if (payload.backfillBidCancelActivities) {
      promises.push(backfillBidCancelActivities());
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
    backfillBidCancelActivities = true
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

if (config.doBackgroundWork && config.doElasticsearchWork) {
  redlock
    .acquire([`${backfillActivitiesElasticsearchJob}-lock`], 60 * 60 * 24 * 30 * 1000)
    .then(async () => {
      await backfillActivitiesElasticsearchJob.addToQueue(
        true,
        `${ActivitiesIndex.getIndexName()}-1690489670764`,
        "CONFIG_1689873821",
        true,
        true,
        true,
        true,
        true,
        true,
        true
      );
    })
    .catch(() => {
      // Skip on any errors
    });
}
