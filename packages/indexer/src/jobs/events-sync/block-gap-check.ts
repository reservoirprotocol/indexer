import cron from "node-cron";

import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { acquireLock, redlock } from "@/common/redis";
import { idb } from "@/common/db";

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { eventsSyncRealtimeJob } from "@/jobs/events-sync/events-sync-realtime-job";

export type BlockGapCheckJobPayload = {
  limit?: number;
};

export default class BlockGapCheckJob extends AbstractRabbitMqJobHandler {
  queueName = "block-gap-check";
  maxRetries = 30;
  concurrency = 1;
  singleActiveConsumer = true;

  protected async process(payload: BlockGapCheckJobPayload) {
    logger.info("block-gap-check", `Block gap check. limit=${payload.limit}`);

    try {
      const limit = payload.limit || 10000;

      const missingBlocks = await idb.query(
        `WITH last_blocks AS (
        SELECT number
        FROM blocks
        ORDER BY number DESC
        LIMIT ${limit}
        ),
        sequence AS (
        SELECT generate_series(
            (SELECT min(number) FROM last_blocks),
            (SELECT max(number) FROM last_blocks)
        ) AS number
        )
        SELECT s.number AS missing_block_number
        FROM sequence s
        LEFT JOIN last_blocks lb ON s.number = lb.number
        WHERE lb.number IS NULL
        ORDER BY s.number`
      );

      if (missingBlocks.length > 0) {
        logger.info(
          this.queueName,
          JSON.stringify({
            message: `Found missing blocks. limit=${payload.limit}, missingBlocksCount=${missingBlocks.length}`,
            limit,
            missingBlocksCount: missingBlocks.length,
          })
        );

        for (let i = 0; i < missingBlocks.length; i++) {
          const lockAcquired = await acquireLock(
            `${this.queueName}:${missingBlocks[i].missing_block_number}`,
            3600
          );

          if (lockAcquired) {
            logger.info(
              this.queueName,
              `Sync missing block. blockNumber=${missingBlocks[i].missing_block_number}`
            );

            await eventsSyncRealtimeJob.addToQueue({
              block: missingBlocks[i].missing_block_number,
            });
          } else {
            logger.info(
              this.queueName,
              `Skip missing block. blockNumber=${missingBlocks[i].missing_block_number}`
            );
          }
        }
      }
    } catch (error) {
      logger.warn(this.queueName, `Failed to check block gap: ${error}`);
      throw error;
    }
  }

  public async addToQueue(limit = 10000) {
    await this.send({ payload: { limit } });
  }
}

export const blockGapCheckJob = new BlockGapCheckJob();

if (config.doBackgroundWork) {
  cron.schedule(
    // Every 10 minutes
    "*/10 * * * *",
    async () =>
      await redlock
        .acquire(["block-gap-check-lock"], (10 * 60 - 3) * 1000)
        .then(async () => {
          await blockGapCheckJob.addToQueue();
        })
        .catch(() => {
          // Skip any errors
        })
  );
}
