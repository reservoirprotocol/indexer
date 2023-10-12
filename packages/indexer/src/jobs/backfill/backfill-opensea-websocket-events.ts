/* eslint-disable @typescript-eslint/no-explicit-any */

import { Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { redshift } from "@/common/redshift";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import * as orders from "@/orderbook/orders";
import { EventType } from "@opensea/stream-js";
import { handleEvent, parseProtocolData } from "@/websockets/opensea";
import { orderbookOrdersJob } from "@/jobs/orderbook/orderbook-orders-job";
import { GenericOrderInfo } from "@/jobs/orderbook/utils";

const QUEUE_NAME = "backfill-opensea-websocket-events";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    removeOnComplete: 1000,
    removeOnFail: 10000,
    timeout: 60000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const { fromEventTimestamp, toEventTimestamp, fromOrderHash } = job.data;

      const limit = (await redis.get(`${QUEUE_NAME}-limit`)) || 1;

      let continuationFilter = "";

      if (fromOrderHash) {
        continuationFilter = ` AND (event_timestamp, order_hash) > ($/fromEventTimestamp/, $/fromOrderHash/) `;
      } else {
        continuationFilter = ` AND (event_timestamp) >= ($/fromEventTimestamp/) `;
      }

      // There was a period of time when we didn't properly set the source for OpenSea orders
      const results = await redshift!.manyOrNone(
        `
          SELECT order_hash, event_type, event_data, event_timestamp
          FROM opensea_websocket_events_mainnet
          WHERE event_timestamp < $/toEventTimestamp/ 
          ${continuationFilter}
          ORDER BY event_timestamp, order_hash
          LIMIT $/limit/
        `,
        {
          fromEventTimestamp,
          toEventTimestamp,
          fromOrderHash,
          limit,
        }
      );

      const orderInfos: GenericOrderInfo[] = [];

      for (const result of results) {
        try {
          const eventType = result.event_type as EventType;
          const eventData = JSON.parse(result.event_data);

          const openSeaOrderParams = await handleEvent(eventType, eventData.payload);

          if (openSeaOrderParams) {
            const protocolData = parseProtocolData(eventData.payload);

            let orderInfo: GenericOrderInfo;

            if (protocolData) {
              orderInfo = {
                kind: "seaport",
                info: {
                  orderParams: protocolData.order.params,
                  metadata: {},
                  openSeaOrderParams,
                } as orders.seaport.OrderInfo,
                validateBidValue: true,
              };

              orderInfos.push(orderInfo);
            }
          }
        } catch (error) {
          logger.error(
            QUEUE_NAME,
            `Failed to process record. orderHash=${result.order_hash}, error=${error}`
          );
        }
      }

      if (orderInfos.length) {
        await orderbookOrdersJob.addToQueue(orderInfos);
      }

      logger.info(QUEUE_NAME, `Processed ${results.length} records`);

      if (results.length >= Number(limit)) {
        const lastResult = results[results.length - 1];

        logger.info(
          QUEUE_NAME,
          `Triggering Next Job. fromEventTimestamp=${lastResult.event_timestamp}, toEventTimestamp=${toEventTimestamp}, order_hash=${lastResult.order_hash}`
        );

        await addToQueue(lastResult.event_timestamp, toEventTimestamp, lastResult.order_hash);
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (
  fromEventTimestamp: string,
  toEventTimestamp: string,
  fromOrderHash?: string
) => {
  await queue.add(randomUUID(), { fromEventTimestamp, toEventTimestamp, fromOrderHash });
};
