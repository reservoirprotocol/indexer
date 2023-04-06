/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Sdk from "@reservoir0x/sdk";
import { Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { fromBuffer, getNetAmount } from "@/common/utils";
import { config } from "@/config/index";

import { getJoiPriceObject } from "@/common/joi";
import { Sources } from "@/models/sources";
import _ from "lodash";
import { Orders } from "@/utils/orders";
import { SourcesEntity } from "@/models/sources/sources-entity";
import { Client } from "@elastic/elasticsearch";

const esClient = new Client({
  cloud: {
    id: config.elasticCloudId,
  },
  auth: { apiKey: config.elasticCloudAPIKey },
});

const QUEUE_NAME = "backfill-orders-elasticsearch";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    removeOnComplete: 1000,
    removeOnFail: 10000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork && config.elasticCloudAPIKey) {
  const worker = new Worker(QUEUE_NAME, async (job) => {
    const cursor = job.data.cursor as CursorInfo;

    let continuationFilter = "";

    const limit = (await redis.get(`${QUEUE_NAME}-limit`)) || 100;

    if (cursor) {
      continuationFilter = `(orders.updated_at, orders.id) > (to_timestamp($/createdAt/), $/id/) AND`;
    }

    const criteriaBuildQuery = Orders.buildCriteriaQuery("orders", "token_set_id", false);

    try {
      const results = await idb.manyOrNone(
        `
            SELECT orders.id,
            orders.kind,
            orders.side,
            orders.token_set_id,
            orders.token_set_schema_hash,
            orders.contract,
            orders.maker,
            orders.taker,
            orders.currency,
            orders.price,
            orders.value,
            orders.currency_price,
            orders.currency_value,
            orders.normalized_value,
            orders.currency_normalized_value,
            orders.missing_royalties,
            DYNAMIC,
            DATE_PART('epoch', LOWER(orders.valid_between)) AS valid_from,
            COALESCE(NULLIF(DATE_PART('epoch', UPPER(orders.valid_between)), 'Infinity'), 0) AS valid_until,
            orders.source_id_int,
            orders.quantity_filled,
            orders.quantity_remaining,
            coalesce(orders.fee_bps, 0) AS fee_bps,
            orders.fee_breakdown,
            COALESCE(NULLIF(DATE_PART('epoch', orders.expiration), 'Infinity'), 0) AS expiration,
            (
              CASE
                WHEN orders.fillability_status = 'filled' THEN 'filled'
                WHEN orders.fillability_status = 'cancelled' THEN 'cancelled'
                WHEN orders.fillability_status = 'expired' THEN 'expired'
                WHEN orders.fillability_status = 'no-balance' THEN 'inactive'
                WHEN orders.approval_status = 'no-approval' THEN 'inactive'
                ELSE 'active'
              END
            ) AS status,
            orders.is_reservoir,
            extract(epoch
            FROM orders.created_at) AS created_at,
            (${criteriaBuildQuery}) AS criteria
          FROM orders WHERE
          ${continuationFilter}
          orders.side = 'sell'
          LIMIT $/limit/
        `,
        {
          createdAt: cursor?.createdAt || null,
          id: cursor?.id || null,
          limit,
        }
      );

      const sources = await Sources.getInstance();
      const ordersParsed = await Promise.all(
        results.map(async (order) => {
          const feeBreakdown = order.fee_breakdown;
          const feeBps = order.fee_bps;

          let source: SourcesEntity | undefined;
          if (order.token_set_id?.startsWith("token")) {
            const [, contract, tokenId] = order.token_set_id.split(":");
            source = sources.get(Number(order.source_id_int), contract, tokenId);
          } else {
            source = sources.get(Number(order.source_id_int));
          }

          return {
            id: order.id,
            kind: order.kind,
            side: order.side,
            status: order.status,
            tokenSetId: order.token_set_id,
            tokenSetSchemaHash: fromBuffer(order.token_set_schema_hash),
            contract: fromBuffer(order.contract),
            maker: fromBuffer(order.maker),
            taker: fromBuffer(order.taker),
            price: await getJoiPriceObject(
              {
                gross: {
                  amount: order.currency_price ?? order.price,
                  nativeAmount: order.price,
                },
                net: {
                  amount: getNetAmount(
                    order.currency_price ?? order.price,
                    _.min([order.fee_bps, 10000])
                  ),
                  nativeAmount: getNetAmount(order.price, _.min([order.fee_bps, 10000])),
                },
              },
              order.currency
                ? fromBuffer(order.currency)
                : order.side === "sell"
                ? Sdk.Common.Addresses.Eth[config.chainId]
                : Sdk.Common.Addresses.Weth[config.chainId],
              undefined
            ),
            validFrom: Number(order.valid_from),
            validUntil: Number(order.valid_until),
            quantityFilled: Number(order.quantity_filled),
            quantityRemaining: Number(order.quantity_remaining),

            criteria: order.criteria,
            source: {
              id: source?.address,
              domain: source?.domain,
              name: source?.getTitle(),
              icon: source?.getIcon(),
              url: source?.metadata.url,
            },
            feeBps: Number(feeBps?.toString()),
            feeBreakdown: feeBreakdown,
            expiration: Number(order.expiration),
            isReservoir: order.is_reservoir,
            isDynamic: Boolean(order.dynamic || order.kind === "sudoswap"),
            createdAt: new Date(order.created_at * 1000).toISOString(),
            rawData: order.raw_data,
          };
        })
      );

      await esClient.bulk({
        body: ordersParsed.flatMap((order) => [
          { index: { _index: "asks", _id: order.id } },
          order,
        ]),
      });

      job.data.nextCursor = null;
      if (results.length == limit) {
        const lastToken = _.last(results);
        job.data.nextCursor = {
          createdAt: lastToken.created_at,
          id: lastToken.id,
        };
      }

      logger.info(
        QUEUE_NAME,
        `Processed ${results.length} records.  limit=${limit}, cursor=${JSON.stringify(
          cursor
        )}, nextCursor=${JSON.stringify(job.data.nextCursor)}`
      );
    } catch (error) {
      logger.error(
        QUEUE_NAME,
        `Process error.  limit=${limit}, cursor=${JSON.stringify(cursor)}, error=${JSON.stringify(
          error
        )}`
      );
      job.data.nextCursor = cursor;
    }
  });

  worker.on("completed", async (job) => {
    if (job.data.nextCursor) {
      await addToQueue(job.data.nextCursor);
    }
  });

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });

  // redlock
  //   .acquire([`${QUEUE_NAME}-lock`], 60 * 60 * 24 * 30 * 1000)
  //   .then(async () => {
  //     await addToQueue(Date.now());
  //   })
  //   .catch(() => {
  //     // Skip on any errors
  //   });
}

export const addToQueue = async (timestamp: number) => {
  await queue.add(randomUUID(), { timestamp });
};

export interface CursorInfo {
  createdAt: string;
  id: string;
}
