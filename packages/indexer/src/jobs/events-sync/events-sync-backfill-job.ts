import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { logger } from "@/common/logger";
import { SyncBlockOptions, syncEvents } from "@/events-sync/index";

export type EventSyncBackfillJobPayload = {
  fromBlock: number;
  toBlock: number;
  syncOptions: SyncBlockOptions;
};

export default class EventsSyncBackfillJob extends AbstractRabbitMqJobHandler {
  queueName = "events-sync-backfill";
  maxRetries = 10;
  concurrency = 10;
  timeout = 60000;
  backoff = {
    type: "exponential",
    delay: 10000,
  } as BackoffStrategy;

  protected async process(payload: EventSyncBackfillJobPayload) {
    const { fromBlock, toBlock, syncOptions } = payload;

    // to stop the job from running into issues or taking too long, we dont want to sync a large amount of blocks in one job
    // if the fromBlock & toBlock have a large difference, split the job into smaller jobs
    // if the syncDetails are null, split the job into smaller jobs of 5 blocks
    // otherwise, split the job into smaller jobs of 50 blocks
    const diff = toBlock - fromBlock;
    const splitSize = syncOptions?.syncDetails ? 50 : 5;
    if (diff > splitSize) {
      const splitJobs = [];
      for (let i = fromBlock; i < toBlock; i += splitSize) {
        splitJobs.push({
          fromBlock: i,
          toBlock: Math.min(i + splitSize, toBlock),
          syncOptions,
        });
      }
      await Promise.all(
        splitJobs.map((job) => this.addToQueue(job.fromBlock, job.toBlock, job.syncOptions))
      );
      return;
    }

    try {
      await syncEvents(
        {
          fromBlock,
          toBlock,
        },
        false,
        syncOptions
      );
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
      prioritized?: number;
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
      options?.delay || 0,
      options?.prioritized || 1
    );
  }
}

export const eventsSyncBackfillJob = new EventsSyncBackfillJob();
