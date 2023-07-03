import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import * as tokenSets from "@/orderbook/token-sets";

import { nonFlaggedFloorQueueJob } from "@/jobs/collection-updates/non-flagged-floor-queue-job";
import { generateCollectionTokenSetJob } from "@/jobs/flag-status/generate-collection-token-set-job";

const QUEUE_NAME = "flag-status-update";

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
      const { contract, tokenId, isFlagged } = job.data;

      const result = await idb.oneOrNone(
        `
          SELECT
            (CASE
              WHEN tokens.is_flagged = 1 THEN true
              ELSE false
            END) AS is_flagged,
            tokens.collection_id
          FROM tokens
          WHERE tokens.contract = $/contract/
            AND tokens.token_id = $/tokenId/
        `,
        {
          contract: toBuffer(contract),
          tokenId,
        }
      );
      if (result) {
        if (result.is_flagged !== isFlagged) {
          await idb.none(
            `
              UPDATE tokens SET
                is_flagged = $/isFlagged/,
                last_flag_change = now(),
                last_flag_update = now()
              WHERE tokens.contract = $/contract/
                AND tokens.token_id = $/tokenId/
            `,
            {
              contract: toBuffer(contract),
              tokenId,
              isFlagged: isFlagged ? 1 : 0,
            }
          );

          // Trigger further processes that depend on flagged tokens changes
          await Promise.all([
            // Update the token's collection cached non-flagged floor ask
            nonFlaggedFloorQueueJob.addToQueue([
              {
                kind: "revalidation",
                contract,
                tokenId,
                txHash: null,
                txTimestamp: null,
              },
            ]),
            // Regenerate a new non-flagged token set
            // TODO: Is this needed anymore (we should always use the dynamic token set going forward)?
            generateCollectionTokenSetJob.addToQueue({
              contract,
              collectionId: result.collection_id,
            }),
            // Update the dynamic collection non-flagged token set
            tokenSets.dynamicCollectionNonFlagged.update(
              { collection: result.collection_id },
              { contract, tokenId },
              isFlagged ? "remove" : "add"
            ),
          ]);
        } else {
          await idb.none(
            `
              UPDATE tokens SET
                last_flag_update = now()
              WHERE tokens.contract = $/contract/
                AND tokens.token_id = $/tokenId/
            `,
            {
              contract: toBuffer(contract),
              tokenId,
            }
          );
        }
      }
    },
    { connection: redis.duplicate(), concurrency: 20 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (
  infos: { contract: string; tokenId: string; isFlagged: boolean }[]
) => queue.addBulk(infos.map((i) => ({ name: randomUUID(), data: i })));
