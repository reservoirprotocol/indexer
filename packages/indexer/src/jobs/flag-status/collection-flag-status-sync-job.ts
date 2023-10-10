/* eslint-disable @typescript-eslint/no-explicit-any */

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { config } from "@/config/index";
import { getTokensFlagStatusForCollection } from "@/jobs/flag-status/utils";
import { acquireLock, doesLockExist, getLockExpiration } from "@/common/redis";
import { logger } from "@/common/logger";
import { PendingFlagStatusSyncCollections } from "@/models/pending-flag-status-sync-collections";
import { flagStatusUpdateJob } from "@/jobs/flag-status/flag-status-update-job";

export class CollectionFlagStatusSyncJob extends AbstractRabbitMqJobHandler {
  queueName = "collection-flag-status-sync-queue";
  maxRetries = 10;
  concurrency = 1;
  lazyMode = true;
  useSharedChannel = true;
  disableConsuming = !config.disableFlagStatusRefreshJob || !config.liquidityOnly;
  singleActiveConsumer = true;

  protected async process() {
    // check redis to see if we have a lock for this job saying we are sleeping due to rate limiting. This lock only exists if we have been rate limited.
    if (await doesLockExist(this.getLockName())) {
      const expiration = await getLockExpiration(this.getLockName());
      await this.send({}, expiration - Date.now());
      logger.info(this.queueName, "Sleeping due to rate limiting");
      return;
    }

    const collectionToGetFlagStatusFor = await PendingFlagStatusSyncCollections.get();

    if (!collectionToGetFlagStatusFor.length) return;

    let tokens: { contract: string; tokenId: string; isFlagged: boolean | null }[] = [];
    let nextContinuation: string | null = null;

    try {
      const data = await getTokensFlagStatusForCollection(
        collectionToGetFlagStatusFor[0].slug,
        collectionToGetFlagStatusFor[0].contract,
        collectionToGetFlagStatusFor[0].continuation
      );
      tokens = data.tokens;
      nextContinuation = data.nextContinuation;
    } catch (error) {
      // add back to redis queue
      await PendingFlagStatusSyncCollections.add(collectionToGetFlagStatusFor, true);
      if ((error as any).response?.status === 429) {
        logger.info(
          this.queueName,
          `Too Many Requests.  error: ${JSON.stringify((error as any).response.data)}`
        );

        const expiresIn = (error as any).response.data.expires_in;

        await acquireLock(this.getLockName(), expiresIn * 1000);
        return;
      } else {
        logger.error(this.queueName, `Error: ${JSON.stringify(error)}`);
        throw error;
      }
    }

    await flagStatusUpdateJob.addToQueue(tokens);

    if (nextContinuation) {
      await PendingFlagStatusSyncCollections.add(
        [
          {
            slug: collectionToGetFlagStatusFor[0].slug,
            contract: collectionToGetFlagStatusFor[0].contract,
            continuation: nextContinuation,
          },
        ],
        true
      );
    }
  }

  public getLockName() {
    return `${this.queueName}-lock`;
  }

  public async addToQueue(delay = 0) {
    await this.send({}, delay);
  }
}

export const collectionFlagStatusSyncJob = new CollectionFlagStatusSyncJob();
