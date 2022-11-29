import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";
import _ from "lodash";

import { logger } from "@/common/logger";
import { acquireLock, redis, releaseLock } from "@/common/redis";
import { config } from "@/config/index";
import { redb } from "@/common/db";
import { toBuffer } from "@/common/utils";
import { Tokens } from "@/models/tokens";

const QUEUE_NAME = "refresh-contract-collections-metadata-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    removeOnComplete: 1000,
    removeOnFail: 1000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { contract } = job.data;

      if (await acquireLock(getLockName(contract), 60)) {
        const contractCollections = await redb.manyOrNone(
          `
          SELECT
            collections.id,
            collections.token_id_range
          FROM collections
          WHERE collections.contract = $/contract/
        `,
          {
            contract: toBuffer(contract),
          }
        );

        logger.info(
          QUEUE_NAME,
          `Collections Refresh. contract=${contract}, contractCollections=${contractCollections.length}`
        );

        if (contractCollections.length) {
          for (const contractCollection of contractCollections) {
            let tokenId = "1";

            if (_.isNull(contractCollection.token_id_range)) {
              tokenId = await Tokens.getSingleToken(contractCollection.id);
            } else if (contractCollection.token_id_range != "(,)") {
              tokenId = `${JSON.parse(contractCollection.token_id_range)[0]}`;
            }

            // await collectionUpdatesMetadata.addToQueue(
            //     contract,
            //     tokenId,
            //     "",
            //     0,
            //     true
            // );

            logger.info(
              QUEUE_NAME,
              `Collection Refresh. contract=${contract}, collectionId=${contractCollection.id}, tokenId=${tokenId}`
            );
          }
        } else {
          const contractToken = await redb.oneOrNone(
            `
            SELECT
              tokens.token_id
            FROM tokens
            WHERE tokens.contract = $/contract/
            LIMIT 1
          `,
            {
              contract: toBuffer(contract),
            }
          );

          logger.info(
            QUEUE_NAME,
            `Token Refresh. contract=${contract}, tokenId=${contractToken?.token_id}`
          );

          // if (contractToken) {
          //   await metadataIndexFetch.addToQueue(
          //     [
          //       {
          //         kind: "single-token",
          //         data: {
          //           method: config.metadataIndexingMethod,
          //           contract: orderParams.contract,
          //           tokenId: contractToken.token_id,
          //           collection: orderParams.contract,
          //         },
          //       },
          //     ],
          //     true,
          //     getNetworkSettings().metadataMintDelay
          //   );
          // }
        }

        await releaseLock(getLockName(contract));
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("failed", async (job) => {
    logger.error(QUEUE_NAME, `Worker failed: ${JSON.stringify(job)}`);
  });

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const getLockName = (contract: string) => {
  return `${QUEUE_NAME}:${contract}-lock`;
};

export const addToQueue = async (contract: string) => {
  await queue.add(randomUUID(), { contract });
};
