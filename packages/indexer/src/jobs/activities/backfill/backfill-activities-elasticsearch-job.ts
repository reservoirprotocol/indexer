import { config } from "@/config/index";
import { logger } from "@/common/logger";
import { ridb } from "@/common/db";
import { elasticsearch } from "@/common/elasticsearch";
import { redis, redlock } from "@/common/redis";

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";

import { backfillSaveActivitiesElasticsearchJob } from "@/jobs/activities/backfill/backfill-save-activities-elasticsearch-job";

import * as CONFIG from "@/elasticsearch/indexes/activities/config";
import cron from "node-cron";
import { RabbitMq } from "@/common/rabbit-mq";
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
    }

    const backfillTransferActivities = async (fromLastBackfill?: boolean) => {
      if (fromLastBackfill) {
        const values = await redis.hvals(`backfill-activities-elasticsearch-job:transfer`);

        for (const value of values) {
          const parsedValue = JSON.parse(value);

          await backfillSaveActivitiesElasticsearchJob.addToQueue(
            "transfer",
            parsedValue.cursor ?? undefined,
            parsedValue.fromTimestamp,
            parsedValue.toTimestamp,
            indexName
          );
        }

        logger.info(
          this.queueName,
          JSON.stringify({
            topic: "backfill-activities",
            message: `from Last Back fill! transfer jobCount=${values.length}`,
            indexName,
          })
        );
      } else {
        const query =
          "SELECT min(timestamp) AS min_timestamp, MAX(timestamp) AS max_timestamp from nft_transfer_events where is_deleted = 0;";

        const timestamps = await ridb.oneOrNone(query);

        const startTimestamp = payload.fromTimestamp || timestamps.min_timestamp;
        const endTimestamp = timestamps.max_timestamp;

        // let currentDay = startTimestamp;

        // let jobCount = 0;
        //
        // while (currentDay <= endTimestamp) {
        //   const fromTimestamp = currentDay;
        //   const toTimestamp = currentDay + 3600;
        //
        //   await backfillSaveActivitiesElasticsearchJob.addToQueue(
        //     "transfer",
        //     undefined,
        //     fromTimestamp,
        //     toTimestamp,
        //     indexName
        //   );
        //
        //   jobCount++;
        //
        //   currentDay = toTimestamp;
        //
        //   await redis.hset(
        //     `backfill-activities-elasticsearch-job:transfer`,
        //     `${fromTimestamp}:${toTimestamp}`,
        //     JSON.stringify({ fromTimestamp, toTimestamp })
        //   );
        // }
        //
        // await redis.set(`backfill-activities-elasticsearch-job-count:transfer`, jobCount);
        //
        // logger.info(
        //   this.queueName,
        //   JSON.stringify({
        //     topic: "backfill-activities",
        //     message: `transfer jobCount=${jobCount}`,
        //     indexName,
        //   })
        // );

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
        const values = await redis.hvals(`backfill-activities-elasticsearch-job:sale`);

        for (const value of values) {
          const parsedValue = JSON.parse(value);

          await backfillSaveActivitiesElasticsearchJob.addToQueue(
            "sale",
            parsedValue.cursor ?? undefined,
            parsedValue.fromTimestamp,
            parsedValue.toTimestamp,
            indexName
          );
        }

        logger.info(
          this.queueName,
          JSON.stringify({
            topic: "backfill-activities",
            message: `from Last Back fill! sale jobCount=${values.length}`,
            indexName,
          })
        );
      } else {
        const query =
          "SELECT min(timestamp) AS min_timestamp, MAX(timestamp) AS max_timestamp from fill_events_2 where is_deleted = 0;";

        const timestamps = await ridb.oneOrNone(query);
        // const minTimestamp = payload.fromTimestamp || timestamps.min_timestamp;

        // const start = new Date(minTimestamp * 1000);
        // const end = new Date(timestamps.max_timestamp * 1000);
        //
        // let loop = new Date(start);
        //
        // let jobCount = 0;
        //
        // while (loop <= end) {
        //   const fromTimestamp = Math.floor(loop.getTime() / 1000);
        //   const newDate = loop.setDate(loop.getDate() + 1);
        //   const toTimestamp = Math.floor(newDate / 1000);
        //
        //   await backfillSaveActivitiesElasticsearchJob.addToQueue(
        //     "sale",
        //     undefined,
        //     fromTimestamp,
        //     toTimestamp,
        //     indexName
        //   );
        //
        //   jobCount++;
        //
        //   loop = new Date(newDate);
        //
        //   await redis.hset(
        //     `backfill-activities-elasticsearch-job:sale`,
        //     `${fromTimestamp}:${toTimestamp}`,
        //     JSON.stringify({ fromTimestamp, toTimestamp })
        //   );
        // }
        //
        // await redis.set(`backfill-activities-elasticsearch-job-count:sale`, jobCount);
        //
        // logger.info(
        //   this.queueName,
        //   JSON.stringify({
        //     topic: "backfill-activities",
        //     message: `sale jobCount=${jobCount}`,
        //     indexName,
        //   })
        // );

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
        const values = await redis.hvals(`backfill-activities-elasticsearch-job:ask`);

        for (const value of values) {
          const parsedValue = JSON.parse(value);

          await backfillSaveActivitiesElasticsearchJob.addToQueue(
            "ask",
            parsedValue.cursor ?? undefined,
            parsedValue.fromTimestamp,
            parsedValue.toTimestamp,
            indexName
          );
        }

        logger.info(
          this.queueName,
          JSON.stringify({
            topic: "backfill-activities",
            message: `from Last Back fill! ask jobCount=${values.length}`,
            indexName,
          })
        );
      } else {
        const query =
          "SELECT extract(epoch from min(updated_at)) AS min_timestamp, extract(epoch from max(updated_at)) AS max_timestamp from orders WHERE side = 'sell';";

        const timestamps = await ridb.oneOrNone(query);
        // const minTimestamp = payload.fromTimestamp || timestamps.min_timestamp;

        // const start = new Date(minTimestamp * 1000);
        // const end = new Date(timestamps.max_timestamp * 1000);
        //
        // let loop = new Date(start);
        //
        // let jobCount = 0;
        //
        // while (loop <= end) {
        //   const fromTimestamp = Math.floor(loop.getTime() / 1000);
        //   const newDate = loop.setDate(loop.getDate() + 1);
        //   const toTimestamp = Math.floor(newDate / 1000);
        //
        //   await backfillSaveActivitiesElasticsearchJob.addToQueue(
        //     "ask",
        //     undefined,
        //     fromTimestamp,
        //     toTimestamp,
        //     indexName
        //   );
        //
        //   jobCount++;
        //
        //   loop = new Date(newDate);
        //
        //   await redis.hset(
        //     `backfill-activities-elasticsearch-job:ask`,
        //     `${fromTimestamp}:${toTimestamp}`,
        //     JSON.stringify({ fromTimestamp, toTimestamp })
        //   );
        // }
        //
        // await redis.set(`backfill-activities-elasticsearch-job-count:ask`, jobCount);
        //
        // logger.info(
        //   this.queueName,
        //   JSON.stringify({
        //     topic: "backfill-activities",
        //     message: `ask jobCount=${jobCount}`,
        //     indexName,
        //   })
        // );

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
        const values = await redis.hvals(`backfill-activities-elasticsearch-job:ask-cancel`);

        for (const value of values) {
          const parsedValue = JSON.parse(value);

          await backfillSaveActivitiesElasticsearchJob.addToQueue(
            "ask-cancel",
            parsedValue.cursor ?? undefined,
            parsedValue.fromTimestamp,
            parsedValue.toTimestamp,
            indexName
          );
        }

        logger.info(
          this.queueName,
          JSON.stringify({
            topic: "backfill-activities",
            message: `from Last Back fill! ask cancel jobCount=${values.length}`,
            indexName,
          })
        );
      } else {
        const query =
          "SELECT extract(epoch from min(updated_at)) AS min_timestamp, extract(epoch from max(updated_at)) AS max_timestamp from orders WHERE side = 'sell' AND fillability_status = 'cancelled';";

        const timestamps = await ridb.oneOrNone(query);
        // const minTimestamp = payload.fromTimestamp || timestamps.min_timestamp;
        //
        // const start = new Date(minTimestamp * 1000);
        // const end = new Date(timestamps.max_timestamp * 1000);
        //
        // let loop = new Date(start);
        //
        // let jobCount = 0;
        //
        // while (loop <= end) {
        //   const fromTimestamp = Math.floor(loop.getTime() / 1000);
        //   const newDate = loop.setDate(loop.getDate() + 1);
        //   const toTimestamp = Math.floor(newDate / 1000);
        //
        //   await backfillSaveActivitiesElasticsearchJob.addToQueue(
        //     "ask-cancel",
        //     undefined,
        //     fromTimestamp,
        //     toTimestamp,
        //     indexName
        //   );
        //
        //   jobCount++;
        //
        //   loop = new Date(newDate);
        //
        //   await redis.hset(
        //     `backfill-activities-elasticsearch-job:ask-cancel`,
        //     `${fromTimestamp}:${toTimestamp}`,
        //     JSON.stringify({ fromTimestamp, toTimestamp })
        //   );
        // }
        //
        // await redis.set(`backfill-activities-elasticsearch-job-count:ask-cancel`, jobCount);
        //
        // logger.info(
        //   this.queueName,
        //   JSON.stringify({
        //     topic: "backfill-activities",
        //     message: `ask cancel jobCount=${jobCount}`,
        //     indexName,
        //   })
        // );

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
        const values = await redis.hvals(`backfill-activities-elasticsearch-job:bid`);

        for (const value of values) {
          const parsedValue = JSON.parse(value);

          await backfillSaveActivitiesElasticsearchJob.addToQueue(
            "bid",
            parsedValue.cursor ?? undefined,
            parsedValue.fromTimestamp,
            parsedValue.toTimestamp,
            indexName
          );
        }

        logger.info(
          this.queueName,
          JSON.stringify({
            topic: "backfill-activities",
            message: `from Last Back fill! bid jobCount=${values.length}`,
            indexName,
          })
        );
      } else {
        const query =
          "SELECT extract(epoch from min(updated_at)) AS min_timestamp, extract(epoch from max(updated_at)) AS max_timestamp from orders WHERE side = 'buy';";

        const timestamps = await ridb.oneOrNone(query);
        // const minTimestamp = payload.fromTimestamp || timestamps.min_timestamp;
        //
        // const start = new Date(minTimestamp * 1000);
        // const end = new Date(timestamps.max_timestamp * 1000);
        //
        // let loop = new Date(start);
        //
        // let jobCount = 0;
        //
        // while (loop <= end) {
        //   const fromTimestamp = Math.floor(loop.getTime() / 1000);
        //   const newDate = loop.setDate(loop.getDate() + 1);
        //   const toTimestamp = Math.floor(newDate / 1000);
        //
        //   await backfillSaveActivitiesElasticsearchJob.addToQueue(
        //     "bid",
        //     undefined,
        //     fromTimestamp,
        //     toTimestamp,
        //     indexName
        //   );
        //
        //   jobCount++;
        //
        //   loop = new Date(newDate);
        //
        //   await redis.hset(
        //     `backfill-activities-elasticsearch-job:bid`,
        //     `${fromTimestamp}:${toTimestamp}`,
        //     JSON.stringify({ fromTimestamp, toTimestamp })
        //   );
        // }
        //
        // await redis.set(`backfill-activities-elasticsearch-job-count:bid`, jobCount);
        //
        // logger.info(
        //   this.queueName,
        //   JSON.stringify({
        //     topic: "backfill-activities",
        //     message: `bid jobCount=${jobCount}`,
        //     indexName,
        //   })
        // );

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
        const values = await redis.hvals(`backfill-activities-elasticsearch-job:bid-cancel`);

        for (const value of values) {
          const parsedValue = JSON.parse(value);

          await backfillSaveActivitiesElasticsearchJob.addToQueue(
            "bid-cancel",
            parsedValue.cursor ?? undefined,
            parsedValue.fromTimestamp,
            parsedValue.toTimestamp,
            indexName
          );
        }

        logger.info(
          this.queueName,
          JSON.stringify({
            topic: "backfill-activities",
            message: `from Last Back fill! bid cancel jobCount=${values.length}`,
            indexName,
          })
        );
      } else {
        const query =
          "SELECT extract(epoch from min(updated_at)) AS min_timestamp, extract(epoch from max(updated_at)) AS max_timestamp from orders WHERE side = 'buy' AND fillability_status = 'cancelled';";

        const timestamps = await ridb.oneOrNone(query);
        // const minTimestamp = payload.fromTimestamp || timestamps.min_timestamp;
        //
        // const start = new Date(minTimestamp * 1000);
        // const end = new Date(timestamps.max_timestamp * 1000);
        //
        // let loop = new Date(start);
        //
        // let jobCount = 0;
        //
        // while (loop <= end) {
        //   const fromTimestamp = Math.floor(loop.getTime() / 1000);
        //   const newDate = loop.setDate(loop.getDate() + 1);
        //   const toTimestamp = Math.floor(newDate / 1000);
        //
        //   await backfillSaveActivitiesElasticsearchJob.addToQueue(
        //     "bid-cancel",
        //     undefined,
        //     fromTimestamp,
        //     toTimestamp,
        //     indexName
        //   );
        //
        //   jobCount++;
        //
        //   loop = new Date(newDate);
        //
        //   await redis.hset(
        //     `backfill-activities-elasticsearch-job:bid-cancel`,
        //     `${fromTimestamp}:${toTimestamp}`,
        //     JSON.stringify({ fromTimestamp, toTimestamp })
        //   );
        // }
        //
        // await redis.set(`backfill-activities-elasticsearch-job-count:bid-cancel`, jobCount);
        //
        // logger.info(
        //   this.queueName,
        //   JSON.stringify({
        //     topic: "backfill-activities",
        //     message: `bid cancel jobCount=${jobCount}`,
        //     indexName,
        //   })
        // );

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

if (config.doBackgroundWork && config.doElasticsearchWork) {
  cron.schedule(
    "*/5 * * * *",
    async () =>
      await redlock
        .acquire(["backfill-activities-lock"], (5 * 60 - 5) * 1000)
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

          const lastQueueSize = Number(
            await redis.get(`${backfillSaveActivitiesElasticsearchJob.queueName}-queue-size`)
          );

          const queueSize = await RabbitMq.getQueueSize(
            backfillSaveActivitiesElasticsearchJob.getQueue(),
            getNetworkName()
          );

          logger.info(
            backfillActivitiesElasticsearchJob.queueName,
            JSON.stringify({
              topic: "backfill-activities",
              message: `jobCounts - update.`,
              queueSize,
              lastQueueSize,
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

          await redis.set(
            `${backfillSaveActivitiesElasticsearchJob.queueName}-queue-size`,
            queueSize,
            "EX",
            600
          );

          // if (queueSize === 0 && lastQueueSize === 0 && totalJobCount > 0) {
          //   logger.info(
          //     backfillActivitiesElasticsearchJob.queueName,
          //     JSON.stringify({
          //       topic: "backfill-activities",
          //       message: `jobCounts - Trigger backfill.`,
          //       queueSize,
          //       lastQueueSize,
          //       totalJobCount,
          //       jobCounts: {
          //         transferJobCount,
          //         saleJobCount,
          //         askJobCount,
          //         askCancelJobCount,
          //         bidJobCount,
          //         bidCancelJobCount,
          //       },
          //     })
          //   );
          //
          //   await backfillActivitiesElasticsearchJob.addToQueue(
          //     false,
          //     "activities-1690489670764",
          //     undefined,
          //     false,
          //     true,
          //     true,
          //     true,
          //     true,
          //     true,
          //     true,
          //     undefined,
          //     true
          //   );
          // }
        })
        .catch(() => {
          // Skip any errors
        })
  );
}
