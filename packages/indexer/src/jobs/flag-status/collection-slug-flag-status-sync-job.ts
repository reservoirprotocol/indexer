/* eslint-disable @typescript-eslint/no-explicit-any */
import _ from "lodash";
import cron from "node-cron";

import { config } from "@/config/index";
import { logger } from "@/common/logger";
import { acquireLock, redlock } from "@/common/redis";

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { flagStatusUpdateJob } from "@/jobs/flag-status/flag-status-update-job";
import { PendingFlagStatusSyncCollectionSlugs } from "@/models/pending-flag-status-sync-collection-slugs";
import { getTokensFlagStatusForCollectionBySlug } from "@/jobs/flag-status/utils";
import { RabbitMQMessage } from "@/common/rabbit-mq";
import { RequestWasThrottledError } from "@/metadata/providers/utils";

export const MAX_PARALLEL_COLLECTIONS = 2;
export const DEFAULT_JOB_DELAY_SECONDS = 1;

export class CollectionSlugFlagStatusSyncJob extends AbstractRabbitMqJobHandler {
  queueName = "collection-slug-flag-status-sync-queue";
  maxRetries = 10;
  concurrency = 1;
  useSharedChannel = true;
  singleActiveConsumer = true;

  public async process() {
    let addToQueue = false;

    const lockAcquired = await acquireLock(this.getLockName(), DEFAULT_JOB_DELAY_SECONDS);

    if (lockAcquired) {
      const collectionsToGetFlagStatusFor = await PendingFlagStatusSyncCollectionSlugs.get(
        MAX_PARALLEL_COLLECTIONS
      );

      if (collectionsToGetFlagStatusFor.length) {
        const collectionsToGetFlagStatusForChunks = _.chunk(collectionsToGetFlagStatusFor, 1);

        const results = await Promise.all(
          collectionsToGetFlagStatusForChunks.map((collectionsToGetFlagStatusForChunk) =>
            getTokensFlagStatusForCollectionBySlug(
              collectionsToGetFlagStatusForChunk[0].slug,
              collectionsToGetFlagStatusForChunk[0].contract,
              collectionsToGetFlagStatusForChunk[0].collectionId,
              collectionsToGetFlagStatusForChunk[0].continuation
            )
              .then(async (data) => {
                logger.info(
                  this.queueName,
                  `Debug contract. contractsToGetFlagStatusForChunk= ${JSON.stringify(
                    collectionsToGetFlagStatusForChunk
                  )}, nextContinuation=${data.nextContinuation}`
                );

                if (data.nextContinuation) {
                  await PendingFlagStatusSyncCollectionSlugs.add(
                    [
                      {
                        slug: collectionsToGetFlagStatusForChunk[0].slug,
                        contract: collectionsToGetFlagStatusForChunk[0].contract,
                        collectionId: collectionsToGetFlagStatusForChunk[0].collectionId,
                        continuation: data.nextContinuation,
                      },
                    ],
                    true
                  );
                }

                return data.tokens;
              })
              .catch(async (error) => {
                if (error instanceof RequestWasThrottledError) {
                  logger.warn(
                    this.queueName,
                    JSON.stringify({
                      message: `Too Many Requests. error=${error}`,
                      collectionsToGetFlagStatusForChunk,
                      error,
                    })
                  );

                  await PendingFlagStatusSyncCollectionSlugs.add(
                    collectionsToGetFlagStatusForChunk,
                    true
                  );
                } else {
                  logger.error(
                    this.queueName,
                    JSON.stringify({
                      message: `getTokensFlagStatusForCollectionByContract error. error=${error}`,
                      collectionsToGetFlagStatusForChunk,
                      error,
                    })
                  );
                }

                return [];
              })
          )
        );

        if (results.length) {
          const tokensFlagStatus = results.flat(1);

          logger.info(
            this.queueName,
            `Debug. collectionsToGetFlagStatusFor=${collectionsToGetFlagStatusFor.length}, tokensFlagStatus=${tokensFlagStatus.length}`
          );

          await flagStatusUpdateJob.addToQueue(tokensFlagStatus);

          addToQueue = true;
        }
      }
    }

    return { addToQueue };
  }

  public getLockName() {
    return `${this.queueName}-lock`;
  }

  public async onCompleted(
    rabbitMqMessage: RabbitMQMessage,
    processResult: {
      addToQueue: boolean;
    }
  ) {
    if (processResult?.addToQueue) {
      await this.addToQueue(DEFAULT_JOB_DELAY_SECONDS * 1000);
    }
  }

  public async addToQueue(delay = 0) {
    await this.send({}, delay);
  }
}

export const collectionSlugFlagStatusSyncJob = new CollectionSlugFlagStatusSyncJob();

if (
  config.doBackgroundWork &&
  !config.disableFlagStatusRefreshJob &&
  config.metadataIndexingMethodCollection === "opensea"
) {
  cron.schedule(
    "*/5 * * * * *",
    async () =>
      await redlock
        .acquire([`${collectionSlugFlagStatusSyncJob.queueName}-cron-lock`], (5 - 1) * 1000)
        .then(async () => collectionSlugFlagStatusSyncJob.addToQueue())
        .catch(() => {
          // Skip on any errors
        })
  );
}
