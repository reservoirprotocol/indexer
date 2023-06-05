import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { inject } from "@/api/index";
import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { now, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { Tokens } from "@/models/tokens";
import * as orderFixes from "@/jobs/order-fixes/fixes";

const QUEUE_NAME = "token-refresh-cache";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    removeOnComplete: 100,
    removeOnFail: 100,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { contract, tokenId, checkTopBid } = job.data;

      if (contract === "0x4923917e9e288b95405e2c893d0ac46b895dda22") {
        // Skip OpenSea Shared contract simulations
        return;
      }

      // Refresh the token floor ask and top bid
      await Tokens.recalculateTokenFloorSell(contract, tokenId);
      await Tokens.recalculateTokenTopBid(contract, tokenId);

      // Simulate and revalidate the floor ask on the token
      const floorAsk = await idb.oneOrNone(
        `
          SELECT
            tokens.floor_sell_id AS id
          FROM tokens
          WHERE tokens.contract = $/contract/
            AND tokens.token_id = $/tokenId/
        `,
        {
          contract: toBuffer(contract),
          tokenId,
        }
      );
      if (floorAsk) {
        // Revalidate
        await orderFixes.addToQueue([{ by: "id", data: { id: floorAsk.id } }]);

        // Simulate
        await inject({
          method: "POST",
          url: `/management/orders/simulate/v1`,
          headers: {
            "Content-Type": "application/json",
          },
          payload: {
            id: floorAsk.id,
          },
        });
      }

      // Top bid simulation is very costly so we only do it if explicitly requested
      if (checkTopBid) {
        // Simulate and revalidate the top bid on the token
        const topBid = await idb.oneOrNone(
          `
            SELECT
              o.id
            FROM orders o
            JOIN token_sets_tokens tst
              ON o.token_set_id = tst.token_set_id
            WHERE tst.contract = $/contract/
              AND tst.token_id = $/tokenId/
              AND o.side = 'buy'
              AND o.fillability_status = 'fillable'
              AND o.approval_status = 'approved'
              AND EXISTS(
                SELECT FROM nft_balances nb
                  WHERE nb.contract = $/contract/
                  AND nb.token_id = $/tokenId/
                  AND nb.amount > 0
                  AND nb.owner != o.maker
              )
            ORDER BY o.value DESC
            LIMIT 1
          `,
          {
            contract: toBuffer(contract),
            tokenId,
          }
        );
        if (topBid) {
          // Revalidate
          await orderFixes.addToQueue([{ by: "id", data: { id: topBid.id } }]);

          // Simulate
          if (config.chainId === 1) {
            await inject({
              method: "POST",
              url: `/management/orders/simulate/v1`,
              headers: {
                "Content-Type": "application/json",
              },
              payload: {
                id: topBid.id,
              },
            });
          }
        }
      }
    },
    { connection: redis.duplicate(), concurrency: 10 }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (contract: string, tokenId: string, checkTopBid?: boolean) =>
  queue.add(
    randomUUID(),
    { contract, tokenId, checkTopBid },
    {
      // No more than one job per token per second
      jobId: `${contract}:${tokenId}:${now()}`,
    }
  );
