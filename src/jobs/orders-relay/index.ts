import * as Sdk from "@reservoir0x/sdk";
import cron from "node-cron";

import { logger } from "@/common/logger";
import { arweaveGateway } from "@/common/provider";
import { acquireLock, redis } from "@/common/redis";
import { config } from "@/config/index";

const PENDING_ORDERS_KEY = "pending_orders";

export const addPendingOrders = async (
  data: { order: Sdk.WyvernV2.Order; schemaHash?: string }[]
) => {
  if (data.length) {
    await redis.rpush(
      PENDING_ORDERS_KEY,
      ...data.map(({ order, schemaHash }) =>
        JSON.stringify({
          kind: "wyvern-v2",
          data: {
            ...order.params,
            schemaHash,
          },
        })
      )
    );
  }
};

export const addPendingTokenSets = async (
  data: { id: string; schema: any; contract: string; tokenIds: string[] }[]
) => {
  if (data.length) {
    await redis.rpush(
      PENDING_ORDERS_KEY,
      ...data.map((tokenSet) =>
        JSON.stringify({
          kind: "token-set",
          data: {
            ...tokenSet,
            // Fix wrong token set ids
            id: `list:${tokenSet.contract}:${tokenSet.id}`,
          },
        })
      )
    );
  }
};

// Only background worker processes
if (config.doBackgroundWork) {
  const CRON_NAME = "orders_relay";

  cron.schedule("*/5 * * * *", async () => {
    const lockAcquired = await acquireLock(
      `${CRON_NAME}_cron_lock`,
      5 * 60 - 5
    );
    if (lockAcquired) {
      logger.info(`${CRON_NAME}_cron`, "Relaying pending orders");

      try {
        const batchSize = 5000;
        const batch = await redis.lrange(PENDING_ORDERS_KEY, 0, batchSize);
        if (batch.length) {
          const wallet = JSON.parse(config.arweaveRelayerKey);
          const transaction = await arweaveGateway.createTransaction(
            {
              data: JSON.stringify(batch.map((b) => JSON.parse(b))),
            },
            wallet
          );
          transaction.addTag("Content-Type", "application/json");
          transaction.addTag("App-Name", `Reservoir Protocol`);
          transaction.addTag("App-Version", "0.0.1");
          transaction.addTag(
            "Network",
            config.chainId === 1 ? "mainnet" : "rinkeby"
          );

          await arweaveGateway.transactions
            .sign(transaction, wallet)
            .then(async () => {
              const uploader = await arweaveGateway.transactions.getUploader(
                transaction
              );
              while (!uploader.isComplete) {
                await uploader.uploadChunk();
              }
            });

          logger.info(
            `${CRON_NAME}_cron`,
            `${batch.length} pending orders relayed via transaction ${transaction.id}`
          );

          await redis.ltrim(PENDING_ORDERS_KEY, batchSize, -1);
        } else {
          logger.info(`${CRON_NAME}_cron`, "No pending orders to relay");
        }
      } catch (error) {
        logger.error(
          `${CRON_NAME}_cron`,
          `Failed to relay pending orders: ${error}`
        );
      }
    }
  });
}
