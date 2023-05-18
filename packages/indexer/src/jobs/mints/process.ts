import { AddressZero } from "@ethersproject/constants";
import { formatEther } from "@ethersproject/units";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { bn, fromBuffer, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { getNetworkSettings } from "@/config/network";
import { fetchTransaction } from "@/events-sync/utils";
import { getMethodSignature } from "@/utils/method-signatures";

const QUEUE_NAME = "mints-process";

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
      const { txHash } = job.data as Mint;

      try {
        // Fetch all transfers associated to the mint transaction
        const transfers = await idb
          .manyOrNone(
            `
              SELECT
                nft_transfer_events.address,
                nft_transfer_events.token_id,
                nft_transfer_events.amount,
                nft_transfer_events.from,
                nft_transfer_events.to
              FROM nft_transfer_events
              WHERE nft_transfer_events.tx_hash = $/txHash/
            `,
            {
              txHash: toBuffer(txHash),
            }
          )
          .then((ts) =>
            ts.map((t) => ({
              contract: fromBuffer(t.address),
              tokenId: t.token_id,
              amount: t.amount,
              from: fromBuffer(t.from),
              to: fromBuffer(t.to),
            }))
          );

        // Return early if no transfers are available
        if (!transfers.length) {
          return;
        }

        // Exclude certain contracts
        const contract = transfers[0].contract;
        if (getNetworkSettings().mintsAsSalesBlacklist.includes(contract)) {
          return;
        }

        // Make sure that every mint in the transaction is associated to the same contract
        if (!transfers.every((t) => t.contract === contract)) {
          return;
        }

        // Make sure that every mint in the transaction is associated to the same collection
        const collectionsResult = await idb.manyOrNone(
          `
            SELECT
              tokens.collection_id
            FROM tokens
            WHERE tokens.contract = $/contract/
              AND tokens.token_id IN ($/tokenIds:list/)
          `,
          {
            contract: toBuffer(contract),
            tokenIds: transfers.map((t) => t.tokenId),
          }
        );
        if (!collectionsResult.length) {
          return;
        }
        const collection = collectionsResult[0].collection_id;
        if (!collectionsResult.every((c) => c.collection_id && c.collection_id === collection)) {
          return;
        }

        // Make sure that every mint in the transaction goes to the transaction sender
        const tx = await fetchTransaction(txHash);
        if (!transfers.every((t) => t.from === AddressZero && t.to === tx.from)) {
          return;
        }

        // Make sure something was actually minted
        const amountMinted = transfers.map((t) => Number(t.amount)).reduce((a, b) => a + b);
        if (amountMinted === 0) {
          return;
        }

        // Make sure the total price is evenly divisible by the amount
        const pricePerAmountMinted = bn(tx.value).div(amountMinted);
        if (!bn(tx.value).eq(pricePerAmountMinted.mul(amountMinted))) {
          return;
        }

        // Allow at most a few decimals for the unit price
        const splittedPrice = formatEther(pricePerAmountMinted).split(".");
        if (splittedPrice.length > 1) {
          const numDecimals = splittedPrice[1].length;
          if (numDecimals > 7) {
            return;
          }
        }

        if (tx.data.length < 10) {
          return;
        }

        // Case 1: mint method has no params
        if (tx.data.length === 10) {
          logger.info(
            QUEUE_NAME,
            JSON.stringify({
              txHash: tx,
              txData: tx.data,
              contract,
              kind: "no-params",
              calldata: tx.data,
              price: formatEther(pricePerAmountMinted),
            })
          );
        }

        // Try to get the method signature from the calldata
        const methodSignature = await getMethodSignature(tx.data);
        if (!methodSignature) {
          return;
        }

        // For now, we only support simple data types in the calldata
        if (["(", ")", "[", "]", "bytes", "string"].includes(methodSignature.params)) {
          return;
        }

        const params = methodSignature.params.split(",");

        if (params.length === 1 && params[0].includes("int")) {
          // Case 2: mint method has a single numeric param
          const numericValue = bn(methodSignature.decodedCalldata[0]);
          if (numericValue.eq(amountMinted)) {
            logger.info(
              QUEUE_NAME,
              JSON.stringify({
                txHash: tx,
                txData: tx.data,
                contract,
                kind: "single-numeric-param",
                calldata: tx.data,
                price: formatEther(pricePerAmountMinted),
                methodSignature,
              })
            );
          }
        } else if (params.length === 1 && params[0] === "address") {
          // Case 3: mint method has a single address param
          const addressValue = methodSignature.decodedCalldata[0].toLowerCase();
          if ([AddressZero, tx.from, contract].includes(addressValue)) {
            logger.info(
              QUEUE_NAME,
              JSON.stringify({
                txHash: tx,
                txData: tx.data,
                contract,
                kind: "single-address-param",
                calldata: tx.data,
                price: formatEther(pricePerAmountMinted),
                methodSignature,
              })
            );
          }
        } else if (params.length === 2 && params[0] === "address" && params[1].includes("int")) {
          // Case 4: mint method has a two params, address and numeric

          const addressValue = methodSignature.decodedCalldata[0].toLowerCase();
          const numericValue = bn(methodSignature.decodedCalldata[1]);
          if (
            [AddressZero, tx.from, contract].includes(addressValue) &&
            numericValue.eq(amountMinted)
          ) {
            logger.info(
              QUEUE_NAME,
              JSON.stringify({
                txHash: tx,
                txData: tx.data,
                contract,
                kind: "two-address-numeric-params",
                calldata: tx.data,
                price: formatEther(pricePerAmountMinted),
                methodSignature,
              })
            );
          }
        } else if (params.length === 2 && params[0].includes("int") && params[1] === "address") {
          // Case 5: mint method has a two params, numeric and address
          const numericValue = bn(methodSignature.decodedCalldata[0]);
          const addressValue = methodSignature.decodedCalldata[1].toLowerCase();
          if (
            [AddressZero, tx.from, contract].includes(addressValue) &&
            numericValue.eq(amountMinted)
          ) {
            logger.info(
              QUEUE_NAME,
              JSON.stringify({
                txHash: tx,
                txData: tx.data,
                contract,
                kind: "two-numeric-address-params",
                calldata: tx.data,
                price: formatEther(pricePerAmountMinted),
                methodSignature,
              })
            );
          }
        } else {
          // Case 5: unknown
          logger.info(
            QUEUE_NAME,
            JSON.stringify({
              txHash: tx,
              txData: tx.data,
              contract,
              kind: "unknown",
              calldata: tx.data,
              price: formatEther(pricePerAmountMinted),
              methodSignature,
            })
          );
        }
      } catch (error) {
        logger.error(QUEUE_NAME, `Failed to process mint ${JSON.stringify(job.data)}: ${error}`);
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 30 }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export type Mint = {
  txHash: string;
};

export const addToQueue = async (mints: Mint[]) =>
  queue.addBulk(
    mints.map((mint) => ({
      name: mint.txHash,
      data: mint,
      opts: {
        // Deterministic job id so that we don't perform duplicated work
        jobId: mint.txHash,
      },
    }))
  );
