import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { config } from "@/config/index";
import { logger } from "@/common/logger";
import { checkForOrphanedBlock, syncEvents } from "@/events-sync/index";
import { RabbitMQMessage } from "@/common/rabbit-mq";
import { traceSyncJob } from "./trace-sync-job";
import { redis } from "@/common/redis";
import { getNetworkSettings } from "@/config/network";
import { ridb } from "@/common/db";

export type EventsSyncRealtimeJobPayload = {
  block: number;
  blockEventTimeReceived?: number;
};

export class EventsSyncRealtimeJob extends AbstractRabbitMqJobHandler {
  queueName = "events-sync-realtime";
  maxRetries = 30;
  concurrency = 5;
  timeout = 5 * 60 * 1000;
  backoff = {
    type: "fixed",
    delay: 1000,
  } as BackoffStrategy;

  public async process(payload: EventsSyncRealtimeJobPayload) {
    const { block } = payload;

    if (config.chainId === 204) {
      if (await ridb.oneOrNone(`SELECT * FROM blocks WHERE number=$/block/`, { block })) {
        return;
      }
    }

    try {
      // Update the latest block synced
      const latestBlock = await redis.get("latest-block-realtime");
      if (latestBlock && block > Number(latestBlock)) {
        await redis.set("latest-block-realtime", block);
      }

      const skipLogsCheck = Number(this.rabbitMqMessage?.retryCount) === this.maxRetries;
      await syncEvents(
        {
          fromBlock: block,
          toBlock: block,
        },
        skipLogsCheck,
        undefined,
        {
          blockEventTimeReceived: payload.blockEventTimeReceived,
        }
      );
      await traceSyncJob.addToQueue({ block: block });
      //eslint-disable-next-line
    } catch (error: any) {
      // if the error is block not found, add back to queue
      if (
        error?.message.includes("not found with RPC provider") &&
        !getNetworkSettings().isTestnet
      ) {
        logger.info(this.queueName, error?.message);

        return { addToQueue: true, delay: 1000 };
      } else if (error?.message.includes("unfinalized")) {
        return { addToQueue: true, delay: 2000 };
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
      await this.addToQueue(message.payload, processResult.delay);
    }
  }

  public async addToQueue(params: EventsSyncRealtimeJobPayload, delay = 0) {
    await this.send({ payload: params, jobId: `${params.block}` }, delay);
  }
}

export const eventsSyncRealtimeJob = new EventsSyncRealtimeJob();
