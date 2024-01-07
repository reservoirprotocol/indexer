import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { config } from "@/config/index";
import { logger } from "@/common/logger";
import { checkForOrphanedBlock, syncEvents } from "@/events-sync/syncEventsV2";
import { RabbitMQMessage } from "@/common/rabbit-mq";
import { traceSyncJob } from "./trace-sync-job";

export type EventsSyncRealtimeJobPayload = {
  block: number;
};

export class EventsSyncRealtimeJob extends AbstractRabbitMqJobHandler {
  queueName = "events-sync-realtime";
  maxRetries = 30;
  concurrency = [84531, 80001, 11155111, 43851].includes(config.chainId) ? 1 : 5;

  timeout = 10 * 60 * 1000;
  backoff = ({
    type: "fixed",
    delay: 1000,
  } as BackoffStrategy);

  protected async process(payload: EventsSyncRealtimeJobPayload) {
    const { block } = payload;

    if (config.chainId === 59144 && block >= 916077) {
      logger.info(this.queueName, `Skip Block ${block}`);

      return;
    }

    try {
      await syncEvents(block);
      await traceSyncJob.addToQueue({ block: block });
      //eslint-disable-next-line
    } catch (error: any) {
      // if the error is block not found, add back to queue
      if (error?.message.includes("not found with RPC provider")) {
        logger.info(
          this.queueName,
          `Block ${block} not found with RPC provider, adding back to queue`
        );

        return { addToQueue: true, delay: 1000 };
      } else if (error?.message.includes("unfinalized")) {
        logger.info(this.queueName, `Block ${block} is unfinalized, adding back to queue`);

        return { addToQueue: true, delay: 1000 };
      } else {
        throw error;
      }
    }

    await checkForOrphanedBlock(block);
  }

  public async onCompleted(
    message: RabbitMQMessage,
    processResult: { addToQueue?: boolean; delay?: number }
  ) {
    if (processResult?.addToQueue) {
      logger.info(this.queueName, `Retry block ${message.payload.block}`);
      await this.addToQueue({ block: message.payload.block }, processResult.delay);
    }
  }

  public async addToQueue(params: EventsSyncRealtimeJobPayload, delay = 0) {
    await this.send({ payload: params, jobId: `${params.block}` }, delay);
  }
}

export const eventsSyncRealtimeJob = new EventsSyncRealtimeJob();
