import * as Sdk from "@reservoir0x/sdk";
import cron from "node-cron";

import { logger } from "@/common/logger";
import { arweaveGateway } from "@/common/provider";
import { redlock, redis } from "@/common/redis";
import { config } from "@/config/index";
import { getNetworkName } from "@/config/network";

const PENDING_DATA_KEY = "pending-arweave-data";

// TODO: Add support for relaying token sets

export const addPendingOrdersSeaport = async (
  data: {
    order: Sdk.Seaport.Order;
    schemaHash?: string;
    source?: string;
  }[]
) => {
  if (config.arweaveRelayerKey && data.length) {
    await redis.rpush(
      PENDING_DATA_KEY,
      ...data.map(({ order, schemaHash }) =>
        JSON.stringify({
          kind: "seaport",
          data: {
            ...order.params,
            schemaHash,
          },
        })
      )
    );
  }
};

export const addPendingOrdersSeaportV14 = async (
  data: {
    order: Sdk.SeaportV14.Order;
    schemaHash?: string;
    source?: string;
  }[]
) => {
  if (config.arweaveRelayerKey && data.length) {
    await redis.rpush(
      PENDING_DATA_KEY,
      ...data.map(({ order, schemaHash }) =>
        JSON.stringify({
          kind: "seaport-v1.4",
          data: {
            ...order.params,
            schemaHash,
          },
        })
      )
    );
  }
};

export const addPendingOrdersLooksRare = async (
  data: { order: Sdk.LooksRare.Order; schemaHash?: string; source?: string }[]
) => {
  if (config.arweaveRelayerKey && data.length) {
    await redis.rpush(
      PENDING_DATA_KEY,
      ...data.map(({ order, schemaHash }) =>
        JSON.stringify({
          kind: "looks-rare",
          data: {
            ...order.params,
            schemaHash,
          },
        })
      )
    );
  }
};

export const addPendingOrdersForward = async (
  data: { order: Sdk.Forward.Order; schemaHash?: string; source?: string }[]
) => {
  if (config.arweaveRelayerKey && data.length) {
    await redis.rpush(
      PENDING_DATA_KEY,
      ...data.map(({ order, schemaHash }) =>
        JSON.stringify({
          kind: "forward",
          data: {
            ...order.params,
            schemaHash,
          },
        })
      )
    );
  }
};

export const addPendingOrdersUniverse = async (
  data: { order: Sdk.Universe.Order; schemaHash?: string; source?: string }[]
) => {
  if (config.arweaveRelayerKey && data.length) {
    await redis.rpush(
      PENDING_DATA_KEY,
      ...data.map(({ order, schemaHash }) =>
        JSON.stringify({
          kind: "universe",
          data: {
            ...order.params,
            schemaHash,
          },
        })
      )
    );
  }
};

export const addPendingOrdersZeroExV4 = async (
  data: { order: Sdk.ZeroExV4.Order; schemaHash?: string; source?: string }[]
) => {
  if (config.arweaveRelayerKey && data.length) {
    await redis.rpush(
      PENDING_DATA_KEY,
      ...data.map(({ order, schemaHash }) =>
        JSON.stringify({
          kind: "zeroex-v4",
          data: {
            ...order.params,
            schemaHash,
          },
        })
      )
    );
  }
};

export const addPendingOrdersElement = async (
  data: { order: Sdk.Element.Order; schemaHash?: string; source?: string }[]
) => {
  if (config.arweaveRelayerKey && data.length) {
    await redis.rpush(
      PENDING_DATA_KEY,
      ...data.map(({ order, schemaHash }) =>
        JSON.stringify({
          kind: "element",
          data: {
            ...order.params,
            schemaHash,
          },
        })
      )
    );
  }
};

export const addPendingOrdersInfinity = async (
  data: { order: Sdk.Infinity.Order; schemaHash?: string; source?: string }[]
) => {
  if (config.arweaveRelayerKey && data.length) {
    await redis.rpush(
      PENDING_DATA_KEY,
      ...data.map(({ order, schemaHash }) =>
        JSON.stringify({
          kind: "infinity",
          data: {
            ...order.params,
            schemaHash,
          },
        })
      )
    );
  }
};

export const addPendingOrdersFlow = async (
  data: { order: Sdk.Flow.Order; schemaHash?: string; source?: string }[]
) => {
  if (config.arweaveRelayerKey && data.length) {
    await redis.rpush(
      PENDING_DATA_KEY,
      ...data.map(({ order, schemaHash }) =>
        JSON.stringify({
          kind: "flow",
          data: {
            ...order.params,
            schemaHash,
          },
        })
      )
    );
  }
};

export const addPendingOrdersRarible = async (
  data: { order: Sdk.Rarible.Order; schemaHash?: string; source?: string }[]
) => {
  if (config.arweaveRelayerKey && data.length) {
    await redis.rpush(
      PENDING_DATA_KEY,
      ...data.map(({ order, schemaHash }) =>
        JSON.stringify({
          kind: "rarible",
          data: {
            ...order.params,
            schemaHash,
          },
        })
      )
    );
  }
};

export const addPendingOrdersBlur = async (
  data: { order: Sdk.Blur.Order; schemaHash?: string; source?: string }[]
) => {
  if (config.arweaveRelayerKey && data.length) {
    await redis.rpush(
      PENDING_DATA_KEY,
      ...data.map(({ order, schemaHash }) =>
        JSON.stringify({
          kind: "blur",
          data: {
            ...order.params,
            schemaHash,
          },
        })
      )
    );
  }
};

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork && config.arweaveRelayerKey) {
  // Optimize as much as possible AR usage efficiency
  const relayInterval = config.chainId === 1 ? 3 : 24 * 60;

  cron.schedule(
    `*/${relayInterval} * * * *`,
    async () =>
      await redlock
        .acquire(["arweave-relay-lock"], (60 * relayInterval - 5) * 1000)
        .then(async () => {
          logger.info("arweave-relay", "Relaying pending data");

          try {
            let batch: string[] = [];

            const batchSize = 2000;
            const iterations = 5;
            for (let i = 0; i < iterations; i++) {
              batch = [
                ...batch,
                ...(await redis.lrange(PENDING_DATA_KEY, i * batchSize, (i + 1) * batchSize)),
              ];
            }

            if (batch.length) {
              const wallet = JSON.parse(config.arweaveRelayerKey!);
              const transaction = await arweaveGateway.createTransaction(
                {
                  data: JSON.stringify(batch.map((b) => JSON.parse(b))),
                },
                wallet
              );
              transaction.addTag("Content-Type", "application/json");
              transaction.addTag("App-Name", `Reservoir Protocol`);
              transaction.addTag("App-Version", "0.0.1");
              transaction.addTag("Network", getNetworkName());

              await arweaveGateway.transactions.sign(transaction, wallet).then(async () => {
                const uploader = await arweaveGateway.transactions.getUploader(transaction);
                while (!uploader.isComplete) {
                  await uploader.uploadChunk();
                }
              });

              logger.info(
                "arweave-relay",
                `${batch.length} pending data entries relayed via transaction ${transaction.id}`
              );

              await redis.ltrim(PENDING_DATA_KEY, batchSize * iterations, -1);
            } else {
              logger.info("arweave-relay", "No pending data to relay");
            }
          } catch (error) {
            logger.error("arweave-relay", `Failed to relay pending data: ${error}`);
          }
        })
  );
}
