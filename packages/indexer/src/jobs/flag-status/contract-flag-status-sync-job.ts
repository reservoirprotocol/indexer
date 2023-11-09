/* eslint-disable @typescript-eslint/no-explicit-any */
import cron from "node-cron";
import _ from "lodash";

import { config } from "@/config/index";
import { logger } from "@/common/logger";
import { acquireLock, redlock } from "@/common/redis";

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { flagStatusUpdateJob } from "@/jobs/flag-status/flag-status-update-job";
import { PendingFlagStatusSyncContracts } from "@/models/pending-flag-status-sync-contracts";
import { getTokensFlagStatusForCollectionByContract } from "@/jobs/flag-status/utils";
import { RabbitMQMessage } from "@/common/rabbit-mq";
import { RequestWasThrottledError } from "@/metadata/providers/utils";

export const MAX_PARALLEL_CONTRACTS = 1;
export const DEFAULT_JOB_DELAY_SECONDS = 1;

export class ContractFlagStatusSyncJob extends AbstractRabbitMqJobHandler {
  queueName = "contract-flag-status-sync-queue";
  maxRetries = 10;
  concurrency = 1;
  lazyMode = true;
  useSharedChannel = true;
  singleActiveConsumer = true;

  public async process() {
    let addToQueue = false;

    const lockAcquired = await acquireLock(this.getLockName(), DEFAULT_JOB_DELAY_SECONDS);

    if (lockAcquired) {
      const contractsToGetFlagStatusFor = await PendingFlagStatusSyncContracts.get(
        MAX_PARALLEL_CONTRACTS
      );

      if (contractsToGetFlagStatusFor.length) {
        const contractsToGetFlagStatusForChunks = _.chunk(contractsToGetFlagStatusFor, 1);

        const results = await Promise.all(
          contractsToGetFlagStatusForChunks.map((contractsToGetFlagStatusForChunk) =>
            getTokensFlagStatusForCollectionByContract(
              contractsToGetFlagStatusForChunk[0].contract,
              contractsToGetFlagStatusForChunk[0].continuation
            )
              .then(async (data) => {
                logger.info(
                  this.queueName,
                  `Debug contract. contractsToGetFlagStatusForChunk= ${JSON.stringify(
                    contractsToGetFlagStatusForChunk
                  )}, nextContinuation=${data.nextContinuation}`
                );

                if (data.nextContinuation) {
                  await PendingFlagStatusSyncContracts.add(
                    [
                      {
                        contract: contractsToGetFlagStatusForChunk[0].contract,
                        collectionId: contractsToGetFlagStatusForChunk[0].collectionId,
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
                      contractsToGetFlagStatusForChunk,
                      error,
                    })
                  );

                  await PendingFlagStatusSyncContracts.add(contractsToGetFlagStatusForChunk, true);
                } else {
                  logger.error(
                    this.queueName,
                    JSON.stringify({
                      message: `getTokensFlagStatusForCollectionByContract error. error=${error}`,
                      contractsToGetFlagStatusForChunk,
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
            `Debug. contractsToGetFlagStatusFor=${JSON.stringify(
              contractsToGetFlagStatusFor
            )}, tokensFlagStatus=${tokensFlagStatus.length}`
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

export const contractFlagStatusSyncJob = new ContractFlagStatusSyncJob();

if (
  config.doBackgroundWork &&
  !config.disableFlagStatusRefreshJob &&
  config.metadataIndexingMethodCollection === "opensea"
) {
  cron.schedule(
    "*/5 * * * * *",
    async () =>
      await redlock
        .acquire([`${contractFlagStatusSyncJob.queueName}-cron-lock`], (5 - 1) * 1000)
        .then(async () => contractFlagStatusSyncJob.addToQueue())
        .catch(() => {
          // Skip on any errors
        })
  );
}
