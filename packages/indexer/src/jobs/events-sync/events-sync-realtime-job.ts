import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { config } from "@/config/index";
import { redis } from "@/common/redis";
import { logger } from "@/common/logger";
import { checkForOrphanedBlock, syncEvents } from "@/events-sync/syncEventsV2";

export type EventsSyncRealtimeJobPayload = {
  block: number;
};

export class EventsSyncRealtimeJob extends AbstractRabbitMqJobHandler {
  queueName = "events-sync-realtime";
  maxRetries = 30;
  concurrency = [80001, 137, 11155111].includes(config.chainId) ? 1 : 5;
  consumerTimeout = 60 * 1000;
  backoff = {
    type: "fixed",
    delay: 1000,
  } as BackoffStrategy;

  protected async process(payload: EventsSyncRealtimeJobPayload) {
    const { block } = payload;
    // lets set the latest block to the block we are syncing if it is higher than the current latest block by 1. If it is higher than 1, we create a job to sync the missing blocks
    // if its lower than the current latest block, we dont update the latest block in redis, but we still sync the block (this is for when we are catching up on missed blocks, or when we are syncing a block that is older than the current latest block)
    // dont do this on polygon
    if (config.chainId !== 137 && config.chainId !== 11155111) {
      const latestBlock = await redis.get("latest-block-realtime");
      if (latestBlock) {
        const latestBlockNumber = Number(latestBlock);
        if (block > latestBlockNumber) {
          await redis.set("latest-block-realtime", block);
          if (block - latestBlockNumber > 1) {
            // if we are missing more than 1 block, we need to sync the missing blocks
            for (let i = latestBlockNumber + 1; i < block; i++) {
              logger.info("sync-events-v2", `Found missing block: ${i}`);
              await this.addToQueue({ block: i });
            }
          }
        }
      } else {
        await redis.set("latest-block-realtime", block);
      }
    }

    try {
      await syncEvents(block);
      //eslint-disable-next-line
    } catch (error: any) {
      // if the error is block not found, add back to queue
      if (error?.message.includes("not found with RPC provider")) {
        logger.info(
          this.queueName,
          `Block ${block} not found with RPC provider, adding back to queue`
        );

        await this.addToQueue({ block }, 500);
        return;
      } else {
        throw error;
      }
    }

    await checkForOrphanedBlock(block);
  }

  public async addToQueue(params: EventsSyncRealtimeJobPayload, delay = 0) {
    await this.send({ payload: params, jobId: `${params.block}` }, delay);
  }
}

export const eventsSyncRealtimeJob = new EventsSyncRealtimeJob();
