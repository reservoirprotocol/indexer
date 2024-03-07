import { Interface } from "@ethersproject/abi";
import { AddressZero, HashZero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import { Queue, QueueScheduler, Worker } from "bullmq";

import { idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { redis, redlock } from "@/common/redis";
import { fromBuffer, now, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { orderUpdatesByMakerJob } from "@/jobs/order-updates/order-updates-by-maker-job";
import { baseProvider } from "@/common/provider";

const QUEUE_NAME = "backfill-wrong-erc1155-balances";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    removeOnComplete: 1000,
    removeOnFail: 10000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

const RUN_NUMBER = 1;

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const { tokenId, owner } = job.data;

      const contract = "0xaf57145e0c09a75ca4a2dc65ac80c91920e537ce";
      const results = await idb.manyOrNone(
        `
          SELECT
            nft_balances.token_id,
            nft_balances.owner,
            nft_balances.amount
          FROM nft_balances
          WHERE nft_balances.contract = $/contract/
            AND (nft_balances.token_id, nft_balances.owner) > ($/tokenId/, $/owner/)
          ORDER BY
            nft_balances.token_id,
            nft_balances.owner
          LIMIT 50
        `,
        {
          contract: toBuffer(contract),
          tokenId,
          owner: toBuffer(owner),
        }
      );

      const onchainContract = new Contract(
        contract,
        new Interface([
          "function balanceOf(address owner, uint256 tokenId) view returns (uint256)",
        ]),
        baseProvider
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const values: any[] = [];
      if (results.length) {
        await Promise.all(
          results.map(async (r) => {
            const owner = fromBuffer(r.owner);
            const tokenId = r.token_id;

            if (owner !== AddressZero) {
              const actualBalance = await onchainContract.balanceOf(owner, tokenId);
              if (actualBalance.toString() !== r.amount) {
                values.push({
                  contract: toBuffer(contract),
                  token_id: r.token_id,
                  owner: r.owner,
                  amount: actualBalance.toString(),
                });
              }
            }
          })
        );

        const columns = new pgp.helpers.ColumnSet(["contract", "token_id", "owner", "amount"], {
          table: "nft_balances",
        });
        if (values.length) {
          await idb.none(
            `
              UPDATE nft_balances SET
                amount = x.amount::NUMERIC(78, 0),
                updated_at = now()
              FROM (
                VALUES ${pgp.helpers.values(values, columns)}
              ) AS x(contract, token_id, owner, amount)
              WHERE nft_balances.contract = x.contract::BYTEA
                AND nft_balances.token_id = x.token_id::NUMERIC(78, 0)
                AND nft_balances.owner = x.owner::BYTEA
            `
          );

          await orderUpdatesByMakerJob.addToQueue(
            values.map((v) => ({
              context: `revalidation-${fromBuffer(v.contract)}-${v.token_id}-${fromBuffer(
                v.owner
              )}`,
              maker: fromBuffer(v.owner),
              trigger: {
                kind: "revalidation",
                txHash: HashZero,
                txTimestamp: now(),
              },
              data: {
                kind: "sell-balance",
                contract: fromBuffer(v.contract),
                tokenId: v.token_id,
              },
            }))
          );
        }
      }

      if (results.length >= 50) {
        const lastResult = results[results.length - 1];
        await addToQueue(lastResult.token_id, fromBuffer(lastResult.owner));
      }
    },
    {
      connection: redis.duplicate(),
      concurrency: 1,
    }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });

  if (config.chainId === 70700) {
    redlock
      .acquire([`${QUEUE_NAME}-lock-${RUN_NUMBER}`], 60 * 60 * 24 * 30 * 1000)
      .then(async () => addToQueue("0", "0x0000000000000000000000000000000000000000"))
      .catch(() => {
        // Skip on any errors
      });
  }
}

export const addToQueue = async (tokenId: string, owner: string) => {
  const id = `${tokenId}-${owner}-${RUN_NUMBER}`;
  await queue.add(id, { tokenId, owner }, { jobId: id });
};
