import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";

import { logger } from "@/common/logger";
import { syncEvents, checkForOrphanedBlock, checkForMissingBlocks } from "@/events-sync/index";
import { checkSupports } from "@/events-sync/supports";
import { config } from "@/config/index";

export type EventsSyncRealtimeJobPayload = {
  block: number;
};

export class EventsSyncRealtimeJob extends AbstractRabbitMqJobHandler {
  queueName = "events-sync-realtime";
  maxRetries = 30;
  concurrency = [80001, 137].includes(config.chainId) ? 1 : 5;
  consumerTimeout = 60 * 1000;
  backoff = {
    type: "fixed",
    delay: 1000,
  } as BackoffStrategy;

  constructor() {
    super();
    checkSupports();
  }

  protected async process(payload: EventsSyncRealtimeJobPayload) {
    try {
      const { block } = payload;

      await checkForMissingBlocks(block);
      await syncEvents(block);
      await checkForOrphanedBlock(block);
    } catch (error) {
      logger.warn(this.queueName, `Events realtime syncing failed: ${error}`);
      throw error;
    }
  }

  public async addToQueue(params: EventsSyncRealtimeJobPayload, delay = 0) {
    await this.send({ payload: params, jobId: `${params.block}` }, delay);
  }
}

export const eventsSyncRealtimeJob = new EventsSyncRealtimeJob();
