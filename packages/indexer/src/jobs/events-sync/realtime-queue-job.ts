import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { redis } from "@/common/redis";
import { logger } from "@/common/logger";
import tracer from "@/common/tracer";
import { now } from "lodash";
import { getNetworkSettings } from "@/config/network";
import { baseProvider } from "@/common/provider";
import { syncEvents } from "@/events-sync/index";
import { backfillQueueJob } from "@/jobs/events-sync/backfill-queue-job";
import { config } from "@/config/index";

export class RealtimeQueueJob extends AbstractRabbitMqJobHandler {
  queueName = "events-sync-realtime";
  maxRetries = 10;
  concurrency = 5;

  protected async process() {
    await tracer.trace("processEvent", { resource: "eventsSyncRealtime" }, async () => {
      try {
        const startTime = now();
        // We allow syncing of up to `maxBlocks` blocks behind the head
        // of the blockchain. If we lag behind more than that, then all
        // previous blocks that we cannot cover here will be relayed to
        // the backfill queue.
        const maxBlocks = getNetworkSettings().realtimeSyncMaxBlockLag;

        // For high volume chains get up to headBlockDelay from RPC head block to avoid skipping missing blocks
        const providerHeadBlock = await baseProvider.getBlockNumber();
        const headBlock = providerHeadBlock - getNetworkSettings().headBlockDelay;

        // Fetch the last synced blocked
        let localBlock = Number(await redis.get(`${this.queueName}-last-block`));
        if (localBlock >= headBlock) {
          // Nothing to sync
          return;
        }

        if (localBlock === 0) {
          localBlock = headBlock;
        } else {
          localBlock++;
        }

        const fromBlock = Math.max(localBlock, headBlock - maxBlocks + 1);
        await syncEvents(fromBlock, headBlock);

        // Send any missing blocks to the backfill queue
        if (localBlock + getNetworkSettings().lastBlockLatency < fromBlock) {
          logger.info(
            this.queueName,
            `Out of sync: local block ${localBlock} and upstream block ${fromBlock} (providerHeadBlock ${providerHeadBlock})total missing ${
              fromBlock - localBlock
            }`
          );
          await backfillQueueJob.addToQueue(localBlock, fromBlock - 1);
        }

        // To avoid missing any events, save the last synced block with a delay
        // in order to ensure that the latest blocks will get queried more than
        // once, which is exactly what we are looking for (since events for the
        // latest blocks might be missing due to upstream chain reorgs):
        // https://ethereum.stackexchange.com/questions/109660/eth-getlogs-and-some-missing-logs
        await redis.set(
          `${this.queueName}-last-block`,
          headBlock - getNetworkSettings().lastBlockLatency
        );

        logger.info(
          "sync-events-timing",
          JSON.stringify({
            message: `Events realtime syncing providerHeadBlock ${providerHeadBlock} block range [${fromBlock}, ${headBlock}]`,
            providerHeadBlock,
            headBlock,
            fromBlock,
            totalBlocks: headBlock - fromBlock,
            syncTime: (now() - startTime) / 1000,
          })
        );
      } catch (error) {
        logger.error(this.queueName, `Events realtime syncing failed: ${error}`);
        throw error;
      }
    });
  }

  public async addToQueue() {
    await this.send({ jobId: `${config.chainId}` });
  }
}

export const realtimeQueueJob = new RealtimeQueueJob();
