/* eslint-disable @typescript-eslint/no-explicit-any */

import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { idb, ridb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import {
  WebsocketEventKind,
  WebsocketEventRouter,
} from "@/jobs/websocket-events/websocket-event-router";
import _ from "lodash";
import * as collectionUpdatesTopBid from "@/jobs/collection-updates/top-bid-queue";
import { handleNewBuyOrderJob } from "@/jobs/update-attribute/handle-new-buy-order-job";

const QUEUE_NAME = "token-set-updates-top-bid-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    backoff: {
      type: "exponential",
      delay: 20000,
    },
    removeOnComplete: 1000,
    removeOnFail: 10000,
    timeout: 60000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(QUEUE_NAME, async (job: Job) => jobProcessor(job), {
    connection: redis.duplicate(),
    concurrency: 20,
  });
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export type TopBidInfo = {
  kind: string;
  tokenSetId: string;
  txHash: string | null;
  txTimestamp: number | null;
};

export const addToQueue = async (topBidInfos: TopBidInfo[]) => {
  await queue.addBulk(
    topBidInfos.map((topBidInfos) => ({
      name: `${topBidInfos.tokenSetId}`,
      data: topBidInfos,
    }))
  );
};

export const jobProcessor = async (job: Job) => {
  const { kind, tokenSetId, txHash, txTimestamp } = job.data as TopBidInfo;

  try {
    let tokenSetTopBid = await idb.manyOrNone(
      `
                WITH x AS (
                  SELECT
                    token_sets.id AS token_set_id,
                    y.*
                  FROM token_sets
                  LEFT JOIN LATERAL (
                    SELECT
                      orders.id AS order_id,
                      orders.value,
                      orders.maker
                    FROM orders
                    WHERE orders.token_set_id = token_sets.id
                      AND orders.side = 'buy'
                      AND orders.fillability_status = 'fillable'
                      AND orders.approval_status = 'approved'
                      AND (orders.taker = '\\x0000000000000000000000000000000000000000' OR orders.taker IS NULL)
                    ORDER BY orders.value DESC
                    LIMIT 1
                  ) y ON TRUE
                  WHERE token_sets.id = $/tokenSetId/
                )
                UPDATE token_sets SET
                  top_buy_id = x.order_id,
                  top_buy_value = x.value,
                  top_buy_maker = x.maker,
                  attribute_id = token_sets.attribute_id,
                  collection_id = token_sets.collection_id
                FROM x
                WHERE token_sets.id = x.token_set_id
                  AND (
                    token_sets.top_buy_id IS DISTINCT FROM x.order_id
                    OR token_sets.top_buy_value IS DISTINCT FROM x.value
                  )
                RETURNING
                  collection_id AS "collectionId",
                  attribute_id AS "attributeId",
                  top_buy_value AS "topBuyValue",
                  top_buy_id AS "topBuyId"
              `,
      { tokenSetId }
    );

    if (!tokenSetTopBid.length && kind === "revalidation") {
      // When revalidating, force revalidation of the attribute / collection
      const tokenSetsResult = await ridb.manyOrNone(
        `
                  SELECT
                    token_sets.collection_id,
                    token_sets.attribute_id
                  FROM token_sets
                  WHERE token_sets.id = $/tokenSetId/
                `,
        {
          tokenSetId,
        }
      );

      if (tokenSetsResult.length) {
        tokenSetTopBid = tokenSetsResult.map(
          (result: { collection_id: any; attribute_id: any }) => ({
            kind,
            collectionId: result.collection_id,
            attributeId: result.attribute_id,
            txHash: txHash || null,
            txTimestamp: txTimestamp || null,
          })
        );
      }
    }

    if (tokenSetTopBid.length) {
      if (
        kind === "new-order" &&
        tokenSetTopBid[0].topBuyId &&
        _.isNull(tokenSetTopBid[0].collectionId)
      ) {
        //  Only trigger websocket event for non collection offers.
        await WebsocketEventRouter({
          eventKind: WebsocketEventKind.NewTopBid,
          eventInfo: {
            orderId: tokenSetTopBid[0].topBuyId,
          },
        });
      }

      for (const result of tokenSetTopBid) {
        if (!_.isNull(result.attributeId)) {
          await handleNewBuyOrderJob.addToQueue(result);
        }

        if (!_.isNull(result.collectionId)) {
          await collectionUpdatesTopBid.addToQueue([
            {
              collectionId: result.collectionId,
              kind: kind,
              txHash: txHash || null,
              txTimestamp: txTimestamp || null,
            } as collectionUpdatesTopBid.TopBidInfo,
          ]);
        }
      }
    }
  } catch (error) {
    logger.error(
      QUEUE_NAME,
      `Failed to process token set top-bid info ${JSON.stringify(job.data)}: ${error}`
    );
    throw error;
  }
};
