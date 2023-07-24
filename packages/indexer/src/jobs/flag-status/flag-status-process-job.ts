/* eslint-disable @typescript-eslint/no-explicit-any */

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { idb, redb } from "@/common/db";
import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { Collections } from "@/models/collections";
import _ from "lodash";
import { toBuffer } from "@/common/utils";
import { PendingFlagStatusSyncJobs } from "@/models/pending-flag-status-sync-jobs";
import { acquireLock, releaseLock } from "@/common/redis";
import {
  PendingFlagStatusSyncToken,
  PendingFlagStatusSyncTokens,
} from "@/models/pending-flag-status-sync-tokens";
import { flagStatusSyncJob } from "@/jobs/flag-status/flag-status-sync-job";

export class FlagStatusProcessJob extends AbstractRabbitMqJobHandler {
  queueName = "flag-status-process-queue";
  maxRetries = 10;
  concurrency = 1;
  lazyMode = true;
  useSharedChannel = true;
  lowestFloorAskQueryLimit = 20;

  protected async process() {
    const pendingFlagStatusSyncJobs = new PendingFlagStatusSyncJobs();

    if (await acquireLock(flagStatusSyncJob.getLockName(), 86400)) {
      logger.info(this.queueName, `Lock acquired.`);

      const pendingJob = await pendingFlagStatusSyncJobs.next();

      if (pendingJob) {
        const { kind, data } = pendingJob;

        logger.info(this.queueName, `Processing job. kind=${kind}, data=${JSON.stringify(data)}`);

        if (kind === "collection") {
          const { collectionId, backfill } = data;

          const collection = await Collections.getById(collectionId);

          // Don't check collections with too many tokens
          if (!collection || collection.tokenCount > config.maxTokenSetSize) {
            await releaseLock(flagStatusSyncJob.getLockName());
            return;
          }

          const pendingFlagStatusSyncTokens = await this.getPendingFlagStatusSyncTokens(
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
            this.queueName,
            `There are ${pendingCount} tokens pending flag status sync for ${collectionId}`
          );

          await flagStatusSyncJob.addToQueue({ collectionId, contract: collection.contract });
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

          await flagStatusSyncJob.addToQueue({ collectionId, contract });
        }
      } else {
        logger.info(this.queueName, `Lock released.`);

        await releaseLock(flagStatusSyncJob.getLockName());
      }
    }
  }

  public async getPendingFlagStatusSyncTokens(collectionId: string, backfill = false) {
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
      const flaggedTokens = await this.getFlaggedTokens(collectionId);

      pendingSyncFlagStatusTokens.push(
        ...flaggedTokens.map((r) => ({
          tokenId: r.token_id,
          isFlagged: 1,
        }))
      );

      const lowestFloorAskTokens = await this.getLowestFloorAskTokens(collectionId);

      pendingSyncFlagStatusTokens.push(
        ...lowestFloorAskTokens.map((r) => ({
          tokenId: r.token_id,
          isFlagged: 0,
        }))
      );

      const recentTransferredTokens = await this.getRecentTransferredTokens(collectionId);

      pendingSyncFlagStatusTokens.push(
        ...recentTransferredTokens.map((r) => ({
          tokenId: r.token_id,
          isFlagged: 0,
        }))
      );
    }

    return _.uniqBy(pendingSyncFlagStatusTokens, "tokenId");
  }

  public async getCollectionTokens(collectionId: string) {
    const limit = 5000;
    let checkForMore = true;
    let continuation = "";

    let tokens: { tokenId: string; isFlagged: number }[] = [];

    while (checkForMore) {
      const query = `
        SELECT token_id, is_flagged
        FROM tokens
        WHERE collection_id = $/collectionId/
        ${continuation}
        ORDER BY token_id ASC
        LIMIT ${limit}
      `;

      const result = await redb.manyOrNone(query, {
        collectionId,
      });

      if (!_.isEmpty(result)) {
        tokens = _.concat(
          tokens,
          _.map(result, (r) => ({
            tokenId: r.token_id,
            isFlagged: r.is_flagged,
          }))
        );
        continuation = `AND token_id > ${_.last(result).token_id}`;
      }

      if (limit > _.size(result)) {
        checkForMore = false;
      }
    }

    return tokens;
  }

  public async getFlaggedTokens(collectionId: string) {
    const flaggedTokensQuery = `
            SELECT token_id
            FROM tokens
            WHERE collection_id = $/collectionId/
            AND is_flagged = 1
        `;

    return await idb.manyOrNone(flaggedTokensQuery, {
      collectionId,
    });
  }

  public async getLowestFloorAskTokens(collectionId: string) {
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
      limit: this.lowestFloorAskQueryLimit,
    });
  }

  public async getRecentTransferredTokens(collectionId: string) {
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
  }

  public async addToQueue() {
    await this.send();
  }
}

export const flagStatusProcessJob = new FlagStatusProcessJob();
