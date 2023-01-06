/* eslint-disable @typescript-eslint/no-explicit-any */

import { Queue, QueueScheduler, Worker } from "bullmq";
import { logger } from "@/common/logger";
import { acquireLock, redis, releaseLock } from "@/common/redis";
import { config } from "@/config/index";

import { Collections } from "@/models/collections";

import { idb } from "@/common/db";
import { toBuffer } from "@/common/utils";
import {
  PendingFlagStatusSyncToken,
  PendingFlagStatusSyncTokens,
} from "@/models/pending-flag-status-sync-tokens";
import * as flagStatusSyncJob from "@/jobs/flag-status/sync-queue";
import _ from "lodash";
import { PendingFlagStatusSyncJobs } from "@/models/pending-flag-status-sync-jobs";
import { randomUUID } from "crypto";

const QUEUE_NAME = "flag-status-process-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    removeOnComplete: 1000,
    removeOnFail: 1000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

const LOWEST_FLOOR_ASK_QUERY_LIMIT = 20;

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async () => {
      const pendingFlagStatusSyncJobs = new PendingFlagStatusSyncJobs();

      if (await acquireLock(flagStatusSyncJob.getLockName(), 86400)) {
        logger.info(QUEUE_NAME, `Lock acquired.`);

        const pendingJob = await pendingFlagStatusSyncJobs.next();

        if (pendingJob) {
          const { kind, data } = pendingJob;

          logger.info(QUEUE_NAME, `Processing job. kind=${kind}, data=${JSON.stringify(data)}`);

          if (kind === "collection") {
            const { collectionId, backfill } = data;

            const collection = await Collections.getById(collectionId);

            // Don't check collections with too many tokens
            if (!collection || collection.tokenCount > config.maxTokenSetSize) {
              await releaseLock(flagStatusSyncJob.getLockName());
              return;
            }

            const pendingFlagStatusSyncTokens = await getPendingFlagStatusSyncTokens(
              collectionId,
              backfill
            );

            const pendingFlagStatusSyncTokensQueue = new PendingFlagStatusSyncTokens(collectionId);

            const pendingCount = await pendingFlagStatusSyncTokensQueue.add(
              pendingFlagStatusSyncTokens.map(
                (r) =>
                  ({
                    collectionId: collectionId,
                    contract: collection.contract,
                    tokenId: r.tokenId,
                    isFlagged: r.isFlagged,
                  } as PendingFlagStatusSyncToken)
              )
            );

            logger.info(
              QUEUE_NAME,
              `There are ${pendingCount} tokens pending flag status sync for ${collectionId}`
            );

            await flagStatusSyncJob.addToQueue(collectionId, collection.contract);
          } else if (kind === "tokens") {
            const { collectionId, contract, tokens } = data;

            const pendingFlagStatusSyncTokensQueue = new PendingFlagStatusSyncTokens(collectionId);
            await pendingFlagStatusSyncTokensQueue.add(
              tokens.map(
                (token) =>
                  ({
                    collectionId: collectionId,
                    contract: contract,
                    tokenId: token.tokenId,
                    isFlagged: token.tokenIsFlagged,
                  } as PendingFlagStatusSyncToken)
              )
            );

            await flagStatusSyncJob.addToQueue(collectionId, contract);
          }
        } else {
          logger.info(QUEUE_NAME, `Lock released.`);

          await releaseLock(flagStatusSyncJob.getLockName());
        }
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

const getPendingFlagStatusSyncTokens = async (collectionId: string, backfill = false) => {
  const pendingSyncFlagStatusTokens = [];

  if (backfill) {
    const tokensQuery = `
            SELECT token_id, is_flagged
            FROM tokens
            WHERE collection_id = $/collectionId/
        `;

    const tokens = await idb.manyOrNone(tokensQuery, {
      collectionId,
    });

    pendingSyncFlagStatusTokens.push(
      ...tokens.map((r) => ({
        tokenId: r.token_id,
        isFlagged: r.is_flagged,
      }))
    );
  } else {
    const flaggedTokens = await getFlaggedTokens(collectionId);

    pendingSyncFlagStatusTokens.push(
      ...flaggedTokens.map((r) => ({
        tokenId: r.token_id,
        isFlagged: 1,
      }))
    );

    const lowestFloorAskTokens = await getLowestFloorAskTokens(collectionId);

    pendingSyncFlagStatusTokens.push(
      ...lowestFloorAskTokens.map((r) => ({
        tokenId: r.token_id,
        isFlagged: 0,
      }))
    );

    const recentTransferredTokens = await getRecentTransferredTokens(collectionId);

    pendingSyncFlagStatusTokens.push(
      ...recentTransferredTokens.map((r) => ({
        tokenId: r.token_id,
        isFlagged: 0,
      }))
    );
  }

  return _.uniqBy(pendingSyncFlagStatusTokens, "tokenId");
};

const getFlaggedTokens = async (collectionId: string) => {
  const flaggedTokensQuery = `
            SELECT token_id
            FROM tokens
            WHERE collection_id = $/collectionId/
            AND is_flagged = 1
        `;

  return await idb.manyOrNone(flaggedTokensQuery, {
    collectionId,
  });
};

const getLowestFloorAskTokens = async (collectionId: string) => {
  const lowestFloorAskQuery = `
            SELECT token_id
            FROM tokens
            WHERE collection_id = $/collectionId/
            AND floor_sell_value IS NOT NULL
            AND (tokens.is_flagged = 0 OR tokens.is_flagged IS NULL)
            ORDER BY floor_sell_value ASC
            LIMIT $/limit/
        `;

  return await idb.manyOrNone(lowestFloorAskQuery, {
    collectionId,
    limit: LOWEST_FLOOR_ASK_QUERY_LIMIT,
  });
};

const getRecentTransferredTokens = async (collectionId: string) => {
  let tokensRangeFilter = "";

  const values = {};

  if (collectionId.match(/^0x[a-f0-9]{40}:\d+:\d+$/g)) {
    const [contract, startTokenId, endTokenId] = collectionId.split(":");

    (values as any).contract = toBuffer(contract);
    (values as any).startTokenId = startTokenId;
    (values as any).endTokenId = endTokenId;

    tokensRangeFilter = `
              AND nft_transfer_events.token_id >= $/startTokenId/
              AND nft_transfer_events.token_id <= $/endTokenId/
            `;
  } else {
    (values as any).contract = toBuffer(collectionId);
  }

  const recentTransfersQuery = `
            SELECT
                DISTINCT ON (nft_transfer_events.token_id) nft_transfer_events.token_id,
                nft_transfer_events.timestamp
            FROM nft_transfer_events
            JOIN tokens ON nft_transfer_events.address = tokens.contract AND nft_transfer_events.token_id = tokens.token_id
            WHERE nft_transfer_events.address = $/contract/
            ${tokensRangeFilter}
            AND (nft_transfer_events.timestamp > extract(epoch from tokens.last_flag_update) OR tokens.last_flag_update IS NULL)
            AND (tokens.is_flagged = 0 OR tokens.is_flagged IS NULL)
            ORDER BY nft_transfer_events.token_id, nft_transfer_events.timestamp DESC
      `;

  return await idb.manyOrNone(recentTransfersQuery, values);
};

export const addToQueue = async () => {
  await queue.add(randomUUID(), {});
};
