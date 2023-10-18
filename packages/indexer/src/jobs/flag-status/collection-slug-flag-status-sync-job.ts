/* eslint-disable @typescript-eslint/no-explicit-any */

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { acquireLock, getLockExpiration, redlock } from "@/common/redis";
import { logger } from "@/common/logger";
import { flagStatusUpdateJob } from "@/jobs/flag-status/flag-status-update-job";
import { PendingFlagStatusSyncCollectionSlugs } from "@/models/pending-flag-status-sync-collection-slugs";
import { getTokensFlagStatusForCollectionBySlug } from "./utils";
import { config } from "@/config/index";
import cron from "node-cron";
import { RequestWasThrottledError } from "@/metadata/providers/utils";

export class CollectionSlugFlagStatusSyncJob extends AbstractRabbitMqJobHandler {
  queueName = "collection-slug-flag-status-sync-queue";
  maxRetries = 10;
  concurrency = 1;
  lazyMode = true;
  useSharedChannel = true;
  singleActiveConsumer = true;

  protected async process() {
    logger.info(this.queueName, "Start");

    // check redis to see if we have a lock for this job saying we are sleeping due to rate limiting. This lock only exists if we have been rate limited.
    const expiration = await getLockExpiration(this.getLockName());
    if (expiration > 0) {
      logger.info(this.queueName, "Sleeping due to rate limiting");
      return;
    }

    const collectionToGetFlagStatusFor = await PendingFlagStatusSyncCollectionSlugs.get();

    if (!collectionToGetFlagStatusFor.length) return;

    let tokens: { contract: string; tokenId: string; isFlagged: boolean | null }[] = [];
    let nextContinuation: string | null = null;

    try {
      const data = await getTokensFlagStatusForCollectionBySlug(
        collectionToGetFlagStatusFor[0].slug,
        collectionToGetFlagStatusFor[0].contract,
        collectionToGetFlagStatusFor[0].collectionId,
        collectionToGetFlagStatusFor[0].continuation
      );
      tokens = data.tokens;
      nextContinuation = data.nextContinuation;
    } catch (error) {
      if (error instanceof RequestWasThrottledError) {
        logger.info(
          this.queueName,
          `Too Many Requests.  error: ${JSON.stringify((error as any).response.data)}`
        );

        const expiresIn = error.delay;

        await acquireLock(this.getLockName(), expiresIn * 1000);
        await PendingFlagStatusSyncCollectionSlugs.add(collectionToGetFlagStatusFor, true);
        return;
      } else {
        logger.error(this.queueName, `Error: ${JSON.stringify(error)}`);
        throw error;
      }
    }

    await flagStatusUpdateJob.addToQueue(tokens);

    if (nextContinuation) {
      await PendingFlagStatusSyncCollectionSlugs.add(
        [
          {
            slug: collectionToGetFlagStatusFor[0].slug,
            contract: collectionToGetFlagStatusFor[0].contract,
            collectionId: collectionToGetFlagStatusFor[0].collectionId,
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

export const collectionSlugFlugStatusSyncJob = new CollectionSlugFlagStatusSyncJob();

if (
  config.doBackgroundWork &&
  !config.disableFlagStatusRefreshJob &&
  config.metadataIndexingMethodCollection === "opensea"
) {
  cron.schedule(
    "*/5 * * * * *",
    async () =>
      await redlock
        .acquire([`${collectionSlugFlugStatusSyncJob.queueName}-cron-lock`], (5 - 1) * 1000)
        .then(async () => collectionSlugFlugStatusSyncJob.addToQueue())
        .catch(() => {
          // Skip on any errors
        })
  );
}
