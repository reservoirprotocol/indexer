import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { logger } from "@/common/logger";
import { SyncBlockOptions, syncEvents, syncEventsOnly } from "@/events-sync/index";
import _ from "lodash";

export type EventSyncBackfillJobPayload = {
  fromBlock: number;
  toBlock: number;
  syncOptions: SyncBlockOptions;
};

export default class EventsSyncBackfillJob extends AbstractRabbitMqJobHandler {
  queueName = "events-sync-backfill";
  maxRetries = 10;
  concurrency = 3;
  timeout = 60000;
  backoff = {
    type: "exponential",
    delay: 10000,
  } as BackoffStrategy;

  public async process(payload: EventSyncBackfillJobPayload) {
    const { fromBlock, toBlock, syncOptions } = payload;

    // to stop the job from running into issues or taking too long, we dont want to sync a large amount of blocks in one job
    // if the fromBlock & toBlock have a large difference, split the job into smaller jobs
    // if the syncDetails are null, split the job into smaller jobs of 1 block
    // otherwise, split the job into smaller jobs of 1 blocks
    const diff = toBlock - fromBlock;
    const splitSize = syncOptions?.blocksPerBatch || 1;

    if (diff > splitSize) {
      const splitJobs = [];
      for (let i = fromBlock; i < toBlock; i += splitSize) {
        splitJobs.push({
          fromBlock: i,
          toBlock: Math.min(i + splitSize - 1, toBlock),
          syncOptions,
        });
      }

      for (const chunk of _.chunk(splitJobs, 1000)) {
        await this.addToQueueBatch(chunk);
      }

      return;
    }

    try {
      if (syncOptions?.syncEventsOnly) {
        await syncEventsOnly(
          {
            fromBlock,
            toBlock,
          },
          syncOptions
        );
      } else {
        await syncEvents(
          {
            fromBlock,
            toBlock,
          },
          false,
          syncOptions
        );
      }
    } catch (error) {
      logger.error(
        this.queueName,
        `Events for [${fromBlock} - ${toBlock}] failed to sync: ${error}`
      );
      throw error;
    }
  }

  public async addToQueue(
    fromBlock: number,
    toBlock: number,
    syncOptions: SyncBlockOptions,
    options?: {
      delay?: number;
    }
  ) {
    await this.send(
      {
        payload: {
          fromBlock,
          toBlock,
          syncOptions,
        },
      },
      options?.delay || 0
    );
  }

  public async addToQueueBatch(
    jobs: { fromBlock: number; toBlock: number; syncOptions: SyncBlockOptions }[],
    options?: {
      delay?: number;
    }
  ) {
    await this.sendBatch(
      jobs.map((job) => {
        return {
          payload: job,
          delay: options?.delay || 0,
        };
      })
    );
  }
}

export const eventsSyncBackfillJob = new EventsSyncBackfillJob();
