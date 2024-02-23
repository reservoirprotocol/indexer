/* eslint-disable @typescript-eslint/no-explicit-any */
import _ from "lodash";
import cron from "node-cron";

import { config } from "@/config/index";
import { logger } from "@/common/logger";
import { acquireLock, extendLock, redlock } from "@/common/redis";

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { getTokenFlagStatus } from "@/jobs/flag-status/utils";
import { PendingFlagStatusSyncTokens } from "@/models/pending-flag-status-sync-tokens";
import { flagStatusUpdateJob } from "@/jobs/flag-status/flag-status-update-job";
import { RabbitMQMessage } from "@/common/rabbit-mq";
import { RequestWasThrottledError } from "@/metadata/providers/utils";

export const MAX_PARALLEL_TOKENS = 4;
export const DEFAULT_JOB_DELAY_SECONDS = 1;

export class TokenFlagStatusSyncJob extends AbstractRabbitMqJobHandler {
  queueName = "token-flag-status-sync-queue";
  maxRetries = 10;
  concurrency = 1;
  useSharedChannel = true;
  singleActiveConsumer = true;

  public async process() {
    let addToQueue = false;

    const lockAcquired = await acquireLock(this.getLockName(), DEFAULT_JOB_DELAY_SECONDS);

    if (lockAcquired) {
      const tokensToGetFlagStatusFor = await PendingFlagStatusSyncTokens.get(MAX_PARALLEL_TOKENS);

      if (tokensToGetFlagStatusFor.length) {
        const tokensToGetFlagStatusForChunks = _.chunk(tokensToGetFlagStatusFor, 1);

        const results = await Promise.all(
          tokensToGetFlagStatusForChunks.map((tokensToGetFlagStatusForChunk) =>
            getTokenFlagStatus(
              tokensToGetFlagStatusForChunk[0].contract,
              tokensToGetFlagStatusForChunk[0].tokenId
            ).catch(async (error) => {
              if (error instanceof RequestWasThrottledError) {
                logger.warn(
                  this.queueName,
                  JSON.stringify({
                    message: `Too Many Requests. error=${error}`,
                    tokensToGetFlagStatusForChunk,
                    error,
                  })
                );

                await extendLock(this.getLockName(), Math.max(error.delay, 5));

                await PendingFlagStatusSyncTokens.add(tokensToGetFlagStatusForChunk, true);
              } else {
                logger.error(
                  this.queueName,
                  JSON.stringify({
                    message: `getTokenFlagStatus error. error=${error}`,
                    tokensToGetFlagStatusForChunk,
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
            `Debug. tokensToGetFlagStatusFor=${tokensToGetFlagStatusFor.length}, tokensFlagStatus=${tokensFlagStatus.length}`
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

export const tokenFlagStatusSyncJob = new TokenFlagStatusSyncJob();

if (
  config.doBackgroundWork &&
  !config.disableFlagStatusRefreshJob &&
  config.metadataIndexingMethodCollection === "opensea"
) {
  cron.schedule(
    "*/5 * * * * *",
    async () =>
      await redlock
        .acquire([`${tokenFlagStatusSyncJob.queueName}-cron-lock`], (5 - 1) * 1000)
        .then(async () => tokenFlagStatusSyncJob.addToQueue())
        .catch(() => {
          // Skip on any errors
        })
  );
}
