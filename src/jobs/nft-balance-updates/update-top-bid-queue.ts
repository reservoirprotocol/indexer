import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { toBuffer } from "@/common/utils";
import { config } from "@/config/index";

const QUEUE_NAME = "nft-balance-updates-update-top-bid-queue";

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
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { contract, tokenId } = job.data as UpdateTopBidInfo;

      try {
        await idb.none(
          `
                WITH x AS (
                    SELECT 
                        nft_balances.contract,
                        nft_balances.token_id,
                        nft_balances.owner,
                        y.id as top_buy_id,
                        y.value as top_buy_value,
                        y.maker as top_buy_maker
                    FROM nft_balances
                    LEFT JOIN LATERAL(
                        SELECT
                            o.id,
                            o.value,
                            o.maker
                        FROM orders o 
                        JOIN token_sets_tokens tst
                        ON o.token_set_id = tst.token_set_id
                        WHERE tst.contract = nft_balances.contract
                        AND tst.token_id = nft_balances.token_id
                        AND o.side = 'buy'
                        AND o.fillability_status = 'fillable'
                        AND o.approval_status = 'approved'
                        AND nft_balances.amount > 0
                        AND nft_balances.owner != o.maker
                        ORDER BY o.value DESC
                        LIMIT 1
                    ) y ON TRUE
                    WHERE nft_balances.contract = $/contract/
                    AND nft_balances.token_id = $/tokenId/
                )
                UPDATE nft_balances AS nb
                SET top_buy_id = x.top_buy_id,
                    top_buy_value = x.top_buy_value,
                    top_buy_maker = x.top_buy_maker
                FROM x
                WHERE nb.contract = x.contract
                AND nb.token_id = x.token_id
                AND nb.owner = x.owner
                AND nb.top_buy_id IS DISTINCT FROM x.top_buy_id
          `,
          {
            contract: toBuffer(contract),
            tokenId,
          }
        );
      } catch (error) {
        logger.error(
          QUEUE_NAME,
          `Failed to process nft balance top bid info ${JSON.stringify(job.data)}: ${error}`
        );
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 10 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export type UpdateTopBidInfo = {
  contract: string;
  tokenId: string;
};

export const addToQueue = async (infos: UpdateTopBidInfo[]) => {
  await queue.addBulk(
    infos.map((info) => ({
      name: `${info.contract}-${info.tokenId}`,
      data: info,
    }))
  );
};
