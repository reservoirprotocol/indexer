import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { logger } from "@/common/logger";
import { syncEvents } from "@/events-sync/syncEventsV2";
import { config } from "@/config/index";

export type RealtimeQueueV2JobPayload = {
  block: number;
};

export class RealtimeQueueV2Job extends AbstractRabbitMqJobHandler {
  queueName = "events-sync-realtime-v2";
  maxRetries = 10;
  concurrency = 5;
  enabledChains = [1, 137];

  protected async process(payload: RealtimeQueueV2JobPayload) {
    try {
      const { block } = payload;
      await syncEvents(block);
    } catch (error) {
      logger.warn(this.queueName, `Events realtime syncing failed: ${error}`);
      throw error;
    }
  }

  public async addToQueue(params: RealtimeQueueV2JobPayload) {
    if (this.enabledChains.includes(config.chainId)) {
      await this.send({ payload: params });
    }
  }
}

export const realtimeQueueV2Job = new RealtimeQueueV2Job();
