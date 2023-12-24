/* eslint-disable @typescript-eslint/no-explicit-any */

import { HashZero } from "@ethersproject/constants";
import * as Sdk from "@reservoir0x/sdk";
import { Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { redis, redlock } from "@/common/redis";
import { fromBuffer, now, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { fetchTransaction } from "@/events-sync/utils";
import { Sources } from "@/models/sources";

const QUEUE_NAME = "backfill-sales";

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
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const { timestamp, txHash, logIndex, batchIndex } = job.data;
      const limit = 300;

      const results = await idb.manyOrNone(
        `
          SELECT
            fill_events_2.tx_hash,
            fill_events_2.log_index,
            fill_events_2.batch_index,
            fill_events_2.timestamp,
            fill_events_2.taker
          FROM fill_events_2
          WHERE (
            fill_events_2.timestamp,
            fill_events_2.tx_hash,
            fill_events_2.log_index,
            fill_events_2.batch_index
          ) < (
            $/timestamp/,
            $/txHash/,
            $/logIndex/,
            $/batchIndex/
          )
            AND fill_events_2.order_kind = 'seaport-v1.5'
            AND fill_events_2.order_side = 'buy'
          ORDER BY
            fill_events_2.timestamp DESC,
            fill_events_2.tx_hash DESC,
            fill_events_2.log_index DESC,
            fill_events_2.batch_index DESC
          LIMIT $/limit/
        `,
        {
          limit,
          timestamp,
          txHash: toBuffer(txHash),
          logIndex,
          batchIndex,
        }
      );

      const values: any[] = [];
      const columns = new pgp.helpers.ColumnSet(["tx_hash", "log_index", "batch_index", "taker"], {
        table: "fill_events_2",
      });

      for (const r of results) {
        if (fromBuffer(r.taker) === Sdk.RouterV6.Addresses.SeaportV15Module[config.chainId]) {
          values.push({
            tx_hash: r.tx_hash,
            log_index: r.log_index,
            batch_index: r.batch_index,
            taker: toBuffer(await fetchTransaction(fromBuffer(r.tx_hash)).then((tx) => tx.from)),
          });
        }
      }

      if (values.length) {
        await idb.none(
          `
            UPDATE fill_events_2 SET
              taker = x.taker::BYTEA,
              updated_at = now()
            FROM (
              VALUES ${pgp.helpers.values(values, columns)}
            ) AS x(tx_hash, log_index, batch_index, taker)
            WHERE fill_events_2.tx_hash = x.tx_hash::BYTEA
              AND fill_events_2.log_index = x.log_index::INT
              AND fill_events_2.batch_index = x.batch_index::INT
              AND fill_events_2.is_deleted != 1
              AND fill_events_2.taker != x.taker::BYTEA
          `
        );
      }

      if (results.length >= limit) {
        const lastResult = results[results.length - 1];
        await addToQueue(
          lastResult.timestamp,
          fromBuffer(lastResult.tx_hash),
          lastResult.log_index,
          lastResult.batch_index
        );
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });

  redlock
    .acquire([`${QUEUE_NAME}-lock-999`], 60 * 60 * 24 * 30 * 1000)
    .then(async () => {
      if (Sdk.RouterV6.Addresses.SeaportV15Module[config.chainId]) {
        await idb.none(
          `
            INSERT INTO routers (
              address,
              source_id
            ) VALUES (
              $/address/,
              $/sourceId/
            ) ON CONFLICT DO NOTHING
          `,
          {
            address: toBuffer(Sdk.RouterV6.Addresses.SeaportV15Module[config.chainId]),
            sourceId: await Sources.getInstance().then(
              (sources) => sources.getByDomain("reservoir.tools")?.id
            ),
          }
        );

        await addToQueue(now(), HashZero, 0, 0);
      }
    })
    .catch(() => {
      // Skip on any errors
    });
}

export const addToQueue = async (
  timestamp: number,
  txHash: string,
  logIndex: number,
  batchIndex: number
) => {
  await queue.add(
    randomUUID(),
    { timestamp, txHash, logIndex, batchIndex },
    {
      jobId: `${timestamp}-${txHash}-${logIndex}-${batchIndex}`,
    }
  );
};
