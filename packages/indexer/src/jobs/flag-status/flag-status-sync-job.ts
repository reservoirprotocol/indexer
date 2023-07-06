/* eslint-disable @typescript-eslint/no-explicit-any */

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { logger } from "@/common/logger";
import _ from "lodash";
import { PendingFlagStatusSyncTokens } from "@/models/pending-flag-status-sync-tokens";
import { releaseLock } from "@/common/redis";
import * as flagStatusProcessQueue from "@/jobs/flag-status/process-queue";
import { generateCollectionTokenSetJob } from "@/jobs/flag-status/generate-collection-token-set-job";
import MetadataApi from "@/utils/metadata-api";
import { TokensEntityUpdateParams } from "@/models/tokens/tokens-entity";
import { Tokens } from "@/models/tokens";
import { nonFlaggedFloorQueueJob } from "@/jobs/collection-updates/non-flagged-floor-queue-job";

export type FlagStatusSyncJobPayload = {
  contract: string;
  collectionId: string;
};

export class FlagStatusSyncJob extends AbstractRabbitMqJobHandler {
  queueName = "flag-status-sync-queue";
  maxRetries = 10;
  concurrency = 1;
  lazyMode = true;
  tokensLimit = 40;
  useSharedChannel = true;

  protected async process(payload: FlagStatusSyncJobPayload) {
    const { collectionId, contract } = payload;

    let delay = 0;

    // Get the tokens from the list
    const pendingFlagStatusSyncTokensQueue = new PendingFlagStatusSyncTokens(collectionId);
    const pendingSyncFlagStatusTokens = await pendingFlagStatusSyncTokensQueue.get(
      this.tokensLimit
    );

    if (pendingSyncFlagStatusTokens.length == 0) {
      logger.info(
        this.queueName,
        `Sync completed. collectionId:${collectionId}, contract:${contract}`
      );

      await releaseLock(this.getLockName());

      await flagStatusProcessQueue.addToQueue();
      await generateCollectionTokenSetJob.addToQueue({ contract, collectionId });

      return;
    }

    const pendingSyncFlagStatusTokensChunks = _.chunk(pendingSyncFlagStatusTokens, 20);

    await Promise.all(
      pendingSyncFlagStatusTokensChunks.map(async (pendingSyncFlagStatusTokensChunk) => {
        try {
          const tokensMetadata = await MetadataApi.getTokensMetadata(
            pendingSyncFlagStatusTokensChunk
          );

          for (const pendingSyncFlagStatusToken of pendingSyncFlagStatusTokensChunk) {
            const tokenMetadata = tokensMetadata.find(
              (tokenMetadata) => tokenMetadata.tokenId === pendingSyncFlagStatusToken.tokenId
            );

            if (!tokenMetadata) {
              logger.warn(
                this.queueName,
                `Missing Token Metadata. collectionId:${collectionId}, contract:${contract}, tokenId: ${pendingSyncFlagStatusToken.tokenId}, tokenIsFlagged:${pendingSyncFlagStatusToken.isFlagged}`
              );

              continue;
            }

            const isFlagged = Number(tokenMetadata.flagged);

            const currentUtcTime = new Date().toISOString();

            const fields: TokensEntityUpdateParams = {
              isFlagged,
              lastFlagUpdate: currentUtcTime,
              lastFlagChange:
                pendingSyncFlagStatusToken.isFlagged != isFlagged ? currentUtcTime : undefined,
            };

            await Tokens.update(contract, pendingSyncFlagStatusToken.tokenId, fields);

            if (pendingSyncFlagStatusToken.isFlagged != isFlagged) {
              logger.info(
                this.queueName,
                `Flag Status Diff. collectionId:${collectionId}, contract:${contract}, tokenId: ${pendingSyncFlagStatusToken.tokenId}, tokenIsFlagged:${pendingSyncFlagStatusToken.isFlagged}, isFlagged:${isFlagged}`
              );

              await nonFlaggedFloorQueueJob.addToQueue([
                {
                  kind: "revalidation",
                  contract,
                  tokenId: pendingSyncFlagStatusToken.tokenId,
                  txHash: null,
                  txTimestamp: null,
                },
              ]);
            } else {
              logger.info(
                this.queueName,
                `Flag Status No Change. collectionId:${collectionId}, contract:${contract}, tokenId: ${pendingSyncFlagStatusToken.tokenId}, tokenIsFlagged:${pendingSyncFlagStatusToken.isFlagged}, isFlagged:${isFlagged}`
              );
            }
          }
        } catch (error) {
          if ((error as any).response?.status === 429) {
            logger.info(
              this.queueName,
              `Too Many Requests. collectionId:${collectionId}, contract:${contract}, error: ${JSON.stringify(
                (error as any).response.data
              )}`
            );

            delay = 60 * 1000;

            await pendingFlagStatusSyncTokensQueue.add(pendingSyncFlagStatusTokensChunk);
          } else {
            logger.error(
              this.queueName,
              `getTokenMetadata error. collectionId:${collectionId}, contract:${contract}, error:${error}`
            );
          }
        }
      })
    );

    await this.addToQueue({ collectionId, contract }, delay);
  }

  public getLockName() {
    return `${this.queueName}-lock`;
  }

  public async addToQueue(params: FlagStatusSyncJobPayload, delay = 0) {
    await this.send({ payload: params }, delay);
  }
}

export const flagStatusSyncJob = new FlagStatusSyncJob();
