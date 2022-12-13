import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import { redb } from "@/common/db";
import { fromBuffer } from "@/common/utils";
import { inject } from "@/api/index";

const QUEUE_NAME = "collection-updates-simulate-floor-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
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
      const { collection } = job.data as SimulateFloorAskInfo;

      try {
        const floorAskResult = await redb.oneOrNone(
          `
                SELECT orders.id, tokens.contract, tokens.token_id
                FROM collections
                JOIN orders ON orders.id = collections.floor_sell_id
                JOIN token_sets_tokens ON token_sets_tokens.token_set_id = orders.token_set_id
                JOIN tokens ON tokens.contract = token_sets_tokens.contract AND tokens.token_id = token_sets_tokens.token_id
                WHERE collections.id = $/collection/
                AND collections.floor_sell_id IS NOT NULL
                `,
          {
            collection,
          }
        );

        if (!floorAskResult?.id) {
          // Skip if the collection does not have a floor ask.
          return;
        }

        const contract = fromBuffer(floorAskResult.contract);
        const tokenId = floorAskResult.token_id;

        const response = await inject({
          method: "POST",
          url: `/tokens/simulate-floor/v1`,
          headers: {
            "Content-Type": "application/json",
          },
          payload: {
            token: `${contract}:${tokenId}`,
            router: "v6",
          },
        });

        const floorSimulationResult = JSON.parse(response.payload);

        logger.info(
          QUEUE_NAME,
          `Simulating collection floor-ask info. jobData=${JSON.stringify(
            job.data
          )}, contract=${contract}, tokenId=${tokenId}, orderId=${
            floorAskResult.id
          }, floorSimulationResult=${floorSimulationResult.message}`
        );
      } catch (error) {
        logger.error(
          QUEUE_NAME,
          `Failed to simulate collection floor-ask. jobData=${JSON.stringify(
            job.data
          )}. error=${error}`
        );

        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export type SimulateFloorAskInfo = {
  collection: string;
};

export const addToQueue = async (simulateFloorAskInfos: SimulateFloorAskInfo[], delay = 0) => {
  await queue.addBulk(
    simulateFloorAskInfos.map((simulateFloorAskInfo) => ({
      name: `${simulateFloorAskInfo.collection}`,
      data: simulateFloorAskInfo,
      opts: { delay },
    }))
  );
};
