/* eslint-disable @typescript-eslint/no-explicit-any */

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";

import { getTokenFlagStatus } from "@/jobs/flag-status/utils";
import { acquireLock, redlock } from "@/common/redis";
import { logger } from "@/common/logger";
import { PendingFlagStatusSyncTokens } from "@/models/pending-flag-status-sync-tokens";
import { flagStatusUpdateJob } from "@/jobs/flag-status/flag-status-update-job";
import { RequestWasThrottledError } from "../orderbook/post-order-external/api/errors";
import { config } from "@/config/index";
import cron from "node-cron";
import { RabbitMQMessage } from "@/common/rabbit-mq";
import _ from "lodash";

export class TokenFlagStatusSyncJob extends AbstractRabbitMqJobHandler {
  queueName = "token-flag-status-sync-queue";
  maxRetries = 10;
  concurrency = 1;
  lazyMode = true;
  useSharedChannel = true;
  singleActiveConsumer = true;

  protected async process() {
    let addToQueue = false;

    const lockAcquired = await acquireLock(this.getLockName(), 1);

    if (lockAcquired) {
      const tokensToGetFlagStatusFor = await PendingFlagStatusSyncTokens.get(2);

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
                  `Too Many Requests.  error: ${JSON.stringify((error as any).response.data)}`
                );

                await PendingFlagStatusSyncTokens.add(tokensToGetFlagStatusFor, true);
              } else {
                logger.error(
                  this.queueName,
                  JSON.stringify({
                    message: `getTokenFlagStatus error. error=${error}`,
                    tokensToGetFlagStatusFor,
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
      await this.addToQueue(1000);
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
