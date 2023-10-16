/* eslint-disable @typescript-eslint/no-explicit-any */

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";

import { getTokenFlagStatus } from "@/jobs/flag-status/utils";
import { acquireLock, getLockExpiration } from "@/common/redis";
import { logger } from "@/common/logger";
import { PendingFlagStatusSyncTokens } from "@/models/pending-flag-status-sync-tokens";
import { flagStatusUpdateJob } from "@/jobs/flag-status/flag-status-update-job";
import { RequestWasThrottledError } from "../orderbook/post-order-external/api/errors";

export class TokenFlagStatusSyncJob extends AbstractRabbitMqJobHandler {
  queueName = "token-flag-status-sync-queue";
  maxRetries = 10;
  concurrency = 1;
  lazyMode = true;
  useSharedChannel = true;
  singleActiveConsumer = true;

  protected async process() {
    // check redis to see if we have a lock for this job saying we are sleeping due to rate limiting. This lock only exists if we have been rate limited.
    const expiration = await getLockExpiration(this.getLockName());

    if (expiration > 0) {
      await this.send({}, expiration - Date.now());
      logger.info(this.queueName, "Sleeping due to rate limiting");
      return;
    }

    const tokensToGetFlagStatusFor = await PendingFlagStatusSyncTokens.get(1);

    if (!tokensToGetFlagStatusFor.length) return;

    try {
      const tokenFlagStatus = await getTokenFlagStatus(
        tokensToGetFlagStatusFor[0].contract,
        tokensToGetFlagStatusFor[0].tokenId
      );

      await flagStatusUpdateJob.addToQueue([tokenFlagStatus]);

      logger.info(
        this.queueName,
        `Debug. tokensToGetFlagStatusForCount=${
          tokensToGetFlagStatusFor.length
        }, tokenFlagStatus=${JSON.stringify(tokenFlagStatus)}`
      );
    } catch (error) {
      if (error instanceof RequestWasThrottledError) {
        logger.info(
          this.queueName,
          `Too Many Requests.  error: ${JSON.stringify((error as any).response.data)}`
        );

        const expiresIn = error.delay;

        await acquireLock(this.getLockName(), expiresIn * 1000);
        await PendingFlagStatusSyncTokens.add(tokensToGetFlagStatusFor, true);
      } else {
        logger.error(
          this.queueName,
          JSON.stringify({
            message: `Error: ${error}`,
            tokensToGetFlagStatusFor,
            error,
          })
        );
        throw error;
      }
    }
  }

  public getLockName() {
    return `${this.queueName}-lock`;
  }

  public async addToQueue(delay = 0) {
    await this.send({}, delay);
  }
}

export const tokenFlagStatusSyncJob = new TokenFlagStatusSyncJob();
