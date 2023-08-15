import { config } from "@/config/index";
import { logger } from "@/common/logger";
import { ridb } from "@/common/db";
import { elasticsearch } from "@/common/elasticsearch";
import { redis, redlock } from "@/common/redis";

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";

import { backfillSaveActivitiesElasticsearchJob } from "@/jobs/activities/backfill/backfill-save-activities-elasticsearch-job";

import * as CONFIG from "@/elasticsearch/indexes/activities/config";
import cron from "node-cron";

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

    const { createIndex, indexName, indexConfig, keepGoing, fromLastBackfill } = payload;

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

    if (!fromLastBackfill) {
      await redis.del(`backfill-activities-elasticsearch-job:transfer`);
      await redis.del(`backfill-activities-elasticsearch-job:sale`);
      await redis.del(`backfill-activities-elasticsearch-job:ask`);
      await redis.del(`backfill-activities-elasticsearch-job:ask-cancel`);
      await redis.del(`backfill-activities-elasticsearch-job:bid`);
      await redis.del(`backfill-activities-elasticsearch-job:bid-cancel`);

      await redis.del(`backfill-activities-elasticsearch-job-count:transfer`);
      await redis.del(`backfill-activities-elasticsearch-job-count:sale`);
      await redis.del(`backfill-activities-elasticsearch-job-count:ask`);
      await redis.del(`backfill-activities-elasticsearch-job-count:ask-cancel`);
      await redis.del(`backfill-activities-elasticsearch-job-count:bid`);
      await redis.del(`backfill-activities-elasticsearch-job-count:bid-cancel`);

      await redis.del(`backfill-activities-elasticsearch-job-backfilled:transfer`);
      await redis.del(`backfill-activities-elasticsearch-job-backfilled:sale`);
      await redis.del(`backfill-activities-elasticsearch-job-backfilled:ask`);
      await redis.del(`backfill-activities-elasticsearch-job-backfilled:ask-cancel`);
      await redis.del(`backfill-activities-elasticsearch-job-backfilled:bid`);
      await redis.del(`backfill-activities-elasticsearch-job-backfilled:bid-cancel`);

      await redis.del(`backfill-activities-elasticsearch-job-backfilled-total:transfer`);
      await redis.del(`backfill-activities-elasticsearch-job-backfilled-total:sale`);
      await redis.del(`backfill-activities-elasticsearch-job-backfilled-total:ask`);
      await redis.del(`backfill-activities-elasticsearch-job-backfilled-total:ask-cancel`);
      await redis.del(`backfill-activities-elasticsearch-job-backfilled-total:bid`);
      await redis.del(`backfill-activities-elasticsearch-job-backfilled-total:bid-cancel`);
    }

    const backfillTransferActivities = async (fromLastBackfill?: boolean) => {
      if (fromLastBackfill) {
        const values = await redis.hvals(`backfill-activities-elasticsearch-job:transfer`);

        for (const value of values) {
          const { fromTimestamp, toTimestamp } = JSON.parse(value);

          await backfillSaveActivitiesElasticsearchJob.addToQueue(
            "transfer",
            undefined,
            fromTimestamp,
            toTimestamp,
            indexName
          );
        }

        logger.info(
          this.queueName,
          JSON.stringify({
            topic: "backfill-activities",
            message: `from Last Back fill! transfer jobCount=${values.length}`,
          })
        );
      } else {
        const query =
          "SELECT min(timestamp) AS min_timestamp, MAX(timestamp) AS max_timestamp from nft_transfer_events where is_deleted = 0;";

        const timestamps = await ridb.oneOrNone(query);
        const minTimestamp = payload.fromTimestamp || timestamps.min_timestamp;

        const start = new Date(minTimestamp * 1000);
        const end = new Date(timestamps.max_timestamp * 1000);

        let loop = new Date(start);

        let jobCount = 0;

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

          jobCount++;

          loop = new Date(newDate);

          await redis.hset(
            `backfill-activities-elasticsearch-job:transfer`,
            `${fromTimestamp}:${toTimestamp}`,
            JSON.stringify({ fromTimestamp, toTimestamp })
          );
        }

        await redis.set(`backfill-activities-elasticsearch-job-count:transfer`, jobCount);

        logger.info(
          this.queueName,
          JSON.stringify({
            topic: "backfill-activities",
            message: `transfer jobCount=${jobCount}`,
          })
        );

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
      }
    };

    const backfillSaleActivities = async (fromLastBackfill?: boolean) => {
      if (fromLastBackfill) {
        const values = await redis.hvals(`backfill-activities-elasticsearch-job:sale`);

        for (const value of values) {
          const { fromTimestamp, toTimestamp } = JSON.parse(value);

          await backfillSaveActivitiesElasticsearchJob.addToQueue(
            "sale",
            undefined,
            fromTimestamp,
            toTimestamp,
            indexName
          );
        }

        logger.info(
          this.queueName,
          JSON.stringify({
            topic: "backfill-activities",
            message: `from Last Back fill! sale jobCount=${values.length}`,
          })
        );
      } else {
        const query =
          "SELECT min(timestamp) AS min_timestamp, MAX(timestamp) AS max_timestamp from fill_events_2 where is_deleted = 0;";

        const timestamps = await ridb.oneOrNone(query);
        const minTimestamp = payload.fromTimestamp || timestamps.min_timestamp;

        const start = new Date(minTimestamp * 1000);
        const end = new Date(timestamps.max_timestamp * 1000);

        let loop = new Date(start);

        let jobCount = 0;

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

          jobCount++;

          loop = new Date(newDate);

          await redis.hset(
            `backfill-activities-elasticsearch-job:sale`,
            `${fromTimestamp}:${toTimestamp}`,
            JSON.stringify({ fromTimestamp, toTimestamp })
          );
        }

        await redis.set(`backfill-activities-elasticsearch-job-count:sale`, jobCount);

        logger.info(
          this.queueName,
          JSON.stringify({
            topic: "backfill-activities",
            message: `sale jobCount=${jobCount}`,
          })
        );

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
      }
    };

    const backfillAskActivities = async (fromLastBackfill?: boolean) => {
      if (fromLastBackfill) {
        const values = await redis.hvals(`backfill-activities-elasticsearch-job:ask`);

        for (const value of values) {
          const { fromTimestamp, toTimestamp } = JSON.parse(value);

          await backfillSaveActivitiesElasticsearchJob.addToQueue(
            "ask",
            undefined,
            fromTimestamp,
            toTimestamp,
            indexName
          );
        }

        logger.info(
          this.queueName,
          JSON.stringify({
            topic: "backfill-activities",
            message: `from Last Back fill! ask jobCount=${values.length}`,
          })
        );
      } else {
        const query =
          "SELECT extract(epoch from min(updated_at)) AS min_timestamp, extract(epoch from max(updated_at)) AS max_timestamp from orders WHERE side = 'sell';";

        const timestamps = await ridb.oneOrNone(query);
        const minTimestamp = payload.fromTimestamp || timestamps.min_timestamp;

        const start = new Date(minTimestamp * 1000);
        const end = new Date(timestamps.max_timestamp * 1000);

        let loop = new Date(start);

        let jobCount = 0;

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

          jobCount++;

          loop = new Date(newDate);

          await redis.hset(
            `backfill-activities-elasticsearch-job:ask`,
            `${fromTimestamp}:${toTimestamp}`,
            JSON.stringify({ fromTimestamp, toTimestamp })
          );
        }

        await redis.set(`backfill-activities-elasticsearch-job-count:ask`, jobCount);

        logger.info(
          this.queueName,
          JSON.stringify({
            topic: "backfill-activities",
            message: `ask jobCount=${jobCount}`,
          })
        );

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
      }
    };

    const backfillAskCancelActivities = async (fromLastBackfill?: boolean) => {
      if (fromLastBackfill) {
        const values = await redis.hvals(`backfill-activities-elasticsearch-job:ask-cancel`);

        for (const value of values) {
          const { fromTimestamp, toTimestamp } = JSON.parse(value);

          await backfillSaveActivitiesElasticsearchJob.addToQueue(
            "ask-cancel",
            undefined,
            fromTimestamp,
            toTimestamp,
            indexName
          );
        }

        logger.info(
          this.queueName,
          JSON.stringify({
            topic: "backfill-activities",
            message: `from Last Back fill! ask cancel jobCount=${values.length}`,
          })
        );
      } else {
        const query =
          "SELECT extract(epoch from min(updated_at)) AS min_timestamp, extract(epoch from max(updated_at)) AS max_timestamp from orders WHERE side = 'sell' AND fillability_status = 'cancelled';";

        const timestamps = await ridb.oneOrNone(query);
        const minTimestamp = payload.fromTimestamp || timestamps.min_timestamp;

        const start = new Date(minTimestamp * 1000);
        const end = new Date(timestamps.max_timestamp * 1000);

        let loop = new Date(start);

        let jobCount = 0;

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

          jobCount++;

          loop = new Date(newDate);

          await redis.hset(
            `backfill-activities-elasticsearch-job:ask-cancel`,
            `${fromTimestamp}:${toTimestamp}`,
            JSON.stringify({ fromTimestamp, toTimestamp })
          );
        }

        await redis.set(`backfill-activities-elasticsearch-job-count:ask-cancel`, jobCount);

        logger.info(
          this.queueName,
          JSON.stringify({
            topic: "backfill-activities",
            message: `ask cancel jobCount=${jobCount}`,
          })
        );

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
      }
    };

    const backfillBidActivities = async (fromLastBackfill?: boolean) => {
      if (fromLastBackfill) {
        const values = await redis.hvals(`backfill-activities-elasticsearch-job:bid`);

        for (const value of values) {
          const { fromTimestamp, toTimestamp } = JSON.parse(value);

          await backfillSaveActivitiesElasticsearchJob.addToQueue(
            "bid",
            undefined,
            fromTimestamp,
            toTimestamp,
            indexName
          );
        }

        logger.info(
          this.queueName,
          JSON.stringify({
            topic: "backfill-activities",
            message: `from Last Back fill! bid jobCount=${values.length}`,
          })
        );
      } else {
        const query =
          "SELECT extract(epoch from min(updated_at)) AS min_timestamp, extract(epoch from max(updated_at)) AS max_timestamp from orders WHERE side = 'buy';";

        const timestamps = await ridb.oneOrNone(query);
        const minTimestamp = payload.fromTimestamp || timestamps.min_timestamp;

        const start = new Date(minTimestamp * 1000);
        const end = new Date(timestamps.max_timestamp * 1000);

        let loop = new Date(start);

        let jobCount = 0;

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

          jobCount++;

          loop = new Date(newDate);

          await redis.hset(
            `backfill-activities-elasticsearch-job:bid`,
            `${fromTimestamp}:${toTimestamp}`,
            JSON.stringify({ fromTimestamp, toTimestamp })
          );
        }

        await redis.set(`backfill-activities-elasticsearch-job-count:bid`, jobCount);

        logger.info(
          this.queueName,
          JSON.stringify({
            topic: "backfill-activities",
            message: `bid jobCount=${jobCount}`,
          })
        );

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
      }
    };

    const backfillBidCancelActivities = async (fromLastBackfill?: boolean) => {
      if (fromLastBackfill) {
        const values = await redis.hvals(`backfill-activities-elasticsearch-job:bid-cancel`);

        for (const value of values) {
          const { fromTimestamp, toTimestamp } = JSON.parse(value);

          await backfillSaveActivitiesElasticsearchJob.addToQueue(
            "bid-cancel",
            undefined,
            fromTimestamp,
            toTimestamp,
            indexName
          );
        }

        logger.info(
          this.queueName,
          JSON.stringify({
            topic: "backfill-activities",
            message: `from Last Back fill! bid cancel jobCount=${values.length}`,
          })
        );
      } else {
        const query =
          "SELECT extract(epoch from min(updated_at)) AS min_timestamp, extract(epoch from max(updated_at)) AS max_timestamp from orders WHERE side = 'buy' AND fillability_status = 'cancelled';";

        const timestamps = await ridb.oneOrNone(query);
        const minTimestamp = payload.fromTimestamp || timestamps.min_timestamp;

        const start = new Date(minTimestamp * 1000);
        const end = new Date(timestamps.max_timestamp * 1000);

        let loop = new Date(start);

        let jobCount = 0;

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

          jobCount++;

          loop = new Date(newDate);

          await redis.hset(
            `backfill-activities-elasticsearch-job:bid-cancel`,
            `${fromTimestamp}:${toTimestamp}`,
            JSON.stringify({ fromTimestamp, toTimestamp })
          );
        }

        await redis.set(`backfill-activities-elasticsearch-job-count:bid-cancel`, jobCount);

        logger.info(
          this.queueName,
          JSON.stringify({
            topic: "backfill-activities",
            message: `bid cancel jobCount=${jobCount}`,
          })
        );

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
    fromTimestamp?: number
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

if (config.doBackgroundWork && config.doElasticsearchWork) {
  cron.schedule(
    "*/30 * * * * *",
    async () =>
      await redlock
        .acquire(["backfill-activities-lock"], (30 - 1) * 1000)
        .then(async () => {
          const transferJobCount = Number(
            await redis.get(`backfill-activities-elasticsearch-job-count:transfer`)
          );

          const saleJobCount = Number(
            await redis.get(`backfill-activities-elasticsearch-job-count:sale`)
          );
          const askJobCount = Number(
            await redis.get(`backfill-activities-elasticsearch-job-count:ask`)
          );
          const askCancelJobCount = Number(
            await redis.get(`backfill-activities-elasticsearch-job-count:ask-cancel`)
          );
          const bidJobCount = Number(
            await redis.get(`backfill-activities-elasticsearch-job-count:bid`)
          );
          const bidCancelJobCount = Number(
            await redis.get(`backfill-activities-elasticsearch-job-count:bid-cancel`)
          );

          const totalJobCount =
            transferJobCount +
            saleJobCount +
            askJobCount +
            askCancelJobCount +
            bidJobCount +
            bidCancelJobCount;

          logger.info(
            backfillActivitiesElasticsearchJob.queueName,
            JSON.stringify({
              topic: "backfill-activities",
              message: `jobCounts update.`,
              totalJobCount,
              jobCounts: {
                transferJobCount,
                saleJobCount,
                askJobCount,
                askCancelJobCount,
                bidJobCount,
                bidCancelJobCount,
              },
            })
          );
        })
        .catch(() => {
          // Skip on any errors
        })
  );
}
