import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { idb, pgp, redb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { fromBuffer, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { fetchTransaction } from "@/events-sync/utils";
import { getRouters } from "@/utils/routers";

const QUEUE_NAME = "backfill-router";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 30,
    backoff: {
      type: "exponential",
      delay: 10000,
    },
    removeOnComplete: 1000,
    removeOnFail: 10000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const details = job.data as Details;

      const routerSource = await getRouters().then((r) => r.get(details.router));
      if (!routerSource) {
        return;
      }

      const blockRange = details.blockRange ?? 10;
      const results = await redb.manyOrNone(
        `
          SELECT
            fill_events_2.tx_hash,
            fill_events_2.block,
            fill_events_2.log_index,
            fill_events_2.batch_index,
            fill_events_2.taker
          FROM fill_events_2
          JOIN transactions
            ON fill_events_2.tx_hash = transactions.hash
          WHERE fill_events_2.block <= $/block/
            AND fill_events_2.block > $/block/ - $/blockRange/
            AND (
              transactions.to = $/router/ OR
              fill_events_2.taker = $/router/
            )
          ORDER BY fill_events_2.block DESC
        `,
        {
          block: details.toBlock,
          blockRange,
          router: toBuffer(details.router),
        }
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const values: any[] = [];
      const columns = new pgp.helpers.ColumnSet(
        ["tx_hash", "log_index", "batch_index", "aggregator_source_id", "fill_source_id", "taker"],
        {
          table: "fill_events_2",
        }
      );

      for (const r of results) {
        const taker = fromBuffer(r.taker);

        values.push({
          tx_hash: r.tx_hash,
          log_index: r.log_index,
          batch_index: r.batch_index,
          aggregator_source_id: routerSource.id,
          fill_source_id: routerSource.id,
          taker:
            taker === details.router
              ? toBuffer(await fetchTransaction(fromBuffer(r.tx_hash)).then((tx) => tx.from))
              : r.taker,
        });
      }

      if (values.length) {
        await idb.none(
          `
            UPDATE fill_events_2 SET
              aggregator_source_id = x.aggregator_source_id::INT,
              fill_source_id = x.fill_source_id::INT,
              taker = x.taker::BYTEA,
              updated_at = now()
            FROM (
              VALUES ${pgp.helpers.values(values, columns)}
            ) AS x(tx_hash, log_index, batch_index, aggregator_source_id, fill_source_id, taker)
            WHERE fill_events_2.tx_hash = x.tx_hash::BYTEA
              AND fill_events_2.log_index = x.log_index::INT
              AND fill_events_2.batch_index = x.batch_index::INT
              AND fill_events_2.is_deleted = 0
              AND (
                fill_events_2.taker != x.taker::BYTEA OR
                fill_events_2.aggregator_source_id != x.aggregator_source_id::INT OR
                fill_events_2.fill_source_id != x.fill_source_id::INT
              )
          `
        );
      }

      const nextBlock = details.toBlock - blockRange;
      if (nextBlock >= details.fromBlock) {
        await addToQueue({
          router: details.router,
          fromBlock: details.fromBlock,
          toBlock: nextBlock,
          blockRange: details.blockRange,
        });
      }
    },
    {
      connection: redis.duplicate(),
      concurrency: 10,
    }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

type Details = {
  router: string;
  fromBlock: number;
  toBlock: number;
  blockRange?: number;
};

export const addToQueue = async (details: Details) => {
  await queue.add(randomUUID(), details, {
    jobId: `${details.router}-${details.fromBlock}-${details.toBlock}`,
  });
};
