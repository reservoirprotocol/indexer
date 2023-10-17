/* eslint-disable @typescript-eslint/no-explicit-any */

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";

import { getTokenFlagStatus } from "@/jobs/flag-status/utils";
import { acquireLock, getLockExpiration, redlock } from "@/common/redis";
import { logger } from "@/common/logger";
import { PendingFlagStatusSyncTokens } from "@/models/pending-flag-status-sync-tokens";
import { flagStatusUpdateJob } from "@/jobs/flag-status/flag-status-update-job";
import { RequestWasThrottledError } from "../orderbook/post-order-external/api/errors";
import { config } from "@/config/index";
import cron from "node-cron";
import { RabbitMQMessage } from "@/common/rabbit-mq";

export class TokenFlagStatusSyncJob extends AbstractRabbitMqJobHandler {
  queueName = "token-flag-status-sync-queue";
  maxRetries = 10;
  concurrency = 1;
  lazyMode = true;
  useSharedChannel = true;
  singleActiveConsumer = true;

  protected async process() {
    logger.info(this.queueName, `Start.`);

    let addToQueue = false;

    // check redis to see if we have a lock for this job saying we are sleeping due to rate limiting. This lock only exists if we have been rate limited.
    const expiration = await getLockExpiration(this.getLockName());

    if (expiration > 0) {
      logger.info(this.queueName, "Sleeping due to rate limiting");
      return;
    }

    const tokensToGetFlagStatusFor = await PendingFlagStatusSyncTokens.get(1);

    if (tokensToGetFlagStatusFor.length) {
      try {
        const tokenFlagStatus = await getTokenFlagStatus(
          tokensToGetFlagStatusFor[0].contract,
          tokensToGetFlagStatusFor[0].tokenId
        );

        logger.info(
          this.queueName,
          `Debug. tokensToGetFlagStatusForCount=${
            tokensToGetFlagStatusFor.length
          }, tokenFlagStatus=${JSON.stringify(tokenFlagStatus)}`
        );

        await flagStatusUpdateJob.addToQueue([tokenFlagStatus]);

        addToQueue = true;
      } catch (error) {
        if (error instanceof RequestWasThrottledError) {
          logger.info(
            this.queueName,
            `Too Many Requests.  error: ${JSON.stringify((error as any).response.data)}`
          );

          await acquireLock(this.getLockName(), 5);

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
