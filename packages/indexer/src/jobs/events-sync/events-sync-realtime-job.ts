import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";

import { logger } from "@/common/logger";
import { syncEvents, checkForOrphanedBlock, checkForMissingBlocks } from "@/events-sync/index";
import { checkSupports } from "@/events-sync/supports";

export type EventsSyncRealtimeJobPayload = {
  block: number;
};

export class EventsSyncRealtimeJob extends AbstractRabbitMqJobHandler {
  queueName = "events-sync-realtime";
  maxRetries = 30;
  concurrency = 5;
  useSharedChannel = true;
  backoff = {
    type: "fixed",
    delay: 100,
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

  public async addToQueue(params: EventsSyncRealtimeJobPayload) {
    await this.send({ payload: params });
  }
}

export const eventsSyncRealtimeJob = new EventsSyncRealtimeJob();
