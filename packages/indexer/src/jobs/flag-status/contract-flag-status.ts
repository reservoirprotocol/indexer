/* eslint-disable @typescript-eslint/no-explicit-any */

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { config } from "@/config/index";
import { acquireLock, getLockExpiration } from "@/common/redis";
import { logger } from "@/common/logger";
import { flagStatusUpdateJob } from "@/jobs/flag-status/flag-status-update-job";
import { RequestWasThrottledError } from "../orderbook/post-order-external/api/errors";
import { PendingFlagStatusSyncContracts } from "@/models/pending-flag-status-sync-contracts";
import { getTokensFlagStatusForCollectionByContract } from "./utils";

export class ContractFlagStatusSyncJob extends AbstractRabbitMqJobHandler {
  queueName = "contract-flag-status-sync-queue";
  maxRetries = 10;
  concurrency = 1;
  lazyMode = true;
  useSharedChannel = true;
  disableConsuming = !config.disableFlagStatusRefreshJob || !config.liquidityOnly;
  singleActiveConsumer = true;

  protected async process() {
    // check redis to see if we have a lock for this job saying we are sleeping due to rate limiting. This lock only exists if we have been rate limited.
    const expiration = await getLockExpiration(this.getLockName());
    if (expiration) {
      await this.send({}, expiration - Date.now());
      logger.info(this.queueName, "Sleeping due to rate limiting");
      return;
    }

    const collectionToGetFlagStatusFor = await PendingFlagStatusSyncContracts.get();

    if (!collectionToGetFlagStatusFor.length) return;

    let tokens: { contract: string; tokenId: string; isFlagged: boolean | null }[] = [];
    let nextContinuation: string | null = null;

    try {
      const data = await getTokensFlagStatusForCollectionByContract(
        collectionToGetFlagStatusFor[0].contract,
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
        await PendingFlagStatusSyncContracts.add(collectionToGetFlagStatusFor, true);
        return;
      } else {
        logger.error(this.queueName, `Error: ${JSON.stringify(error)}`);
        throw error;
      }
    }

    await flagStatusUpdateJob.addToQueue(tokens);

    if (nextContinuation) {
      await PendingFlagStatusSyncContracts.add(
        [
          {
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

export const contractFlugStatusSyncJob = new ContractFlagStatusSyncJob();
