import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { logger } from "@/common/logger";
import { unsyncEvents } from "@/events-sync/index";
import { backfillQueueJob } from "@/jobs/events-sync/backfill-queue-job";
import * as blocksModel from "@/models/blocks";
import { baseProvider } from "@/common/provider";
import { idb } from "@/common/db";
import { fromBuffer } from "@/common/utils";
import { HashZero } from "@ethersproject/constants";

export type BlockCheckQueueJobPayload = {
  block: number;
  blockHash?: string;
  delay?: number;
};

export class BlockCheckQueueJob extends AbstractRabbitMqJobHandler {
  queueName = "events-sync-block-check";
  maxRetries = 10;
  concurrency = 10;
  backoff = {
    type: "exponential",
    delay: 30000,
  } as BackoffStrategy;

  protected async process(payload: BlockCheckQueueJobPayload) {
    const { block, blockHash }: { block: number; blockHash?: string } = payload;

    try {
      // Generic method for handling an orphan block
      const handleOrphanBlock = async (block: { number: number; hash: string }) => {
        // Resync the detected orphaned block
        await backfillQueueJob.addToQueue(block.number, block.number, {
          prioritized: true,
        });
        await unsyncEvents(block.number, block.hash);

        // Delete the orphaned block from the `blocks` table
        await blocksModel.deleteBlock(block.number, block.hash);

        // TODO: Also delete transactions associated to the orphaned
        // block and fetch the transactions of the replacement block
      };

      // Fetch the latest upstream hash for the specified block
      const upstreamBlockHash = (await baseProvider.getBlock(block)).hash.toLowerCase();

      // When `blockHash` is empty, force recheck all event tables
      if (!blockHash) {
        const result = await idb.manyOrNone(
          `
              (SELECT
                nft_transfer_events.block_hash
              FROM nft_transfer_events
              WHERE nft_transfer_events.block = $/block/)

              UNION

              (SELECT
                ft_transfer_events.block_hash
              FROM ft_transfer_events
              WHERE ft_transfer_events.block = $/block/)

              UNION

              (SELECT
                nft_approval_events.block_hash
              FROM nft_approval_events
              WHERE nft_approval_events.block = $/block/)

              UNION

              (SELECT
                fill_events_2.block_hash
              FROM fill_events_2
              WHERE fill_events_2.block = $/block/)

              UNION

              (SELECT
                cancel_events.block_hash
              FROM cancel_events
              WHERE cancel_events.block = $/block/)

              UNION

              (SELECT
                bulk_cancel_events.block_hash
              FROM bulk_cancel_events
              WHERE bulk_cancel_events.block = $/block/)
            `,
          { block }
        );

        for (const { block_hash } of result) {
          const blockHash = fromBuffer(block_hash);
          if (blockHash.toLowerCase() !== upstreamBlockHash.toLowerCase()) {
            logger.info(this.queueName, `Detected orphan block ${block} with hash ${blockHash}}`);
            await handleOrphanBlock({ number: block, hash: blockHash });
          }
        }
      } else {
        if (upstreamBlockHash.toLowerCase() !== blockHash.toLowerCase()) {
          logger.info(this.queueName, `Detected orphan block ${block} with hash ${blockHash}}`);
          await handleOrphanBlock({ number: block, hash: blockHash });
        }
      }
    } catch (error) {
      logger.error(this.queueName, `Block check failed: ${error}`);
      throw error;
    }
  }

  public async addToQueue(params: BlockCheckQueueJobPayload, delayInSeconds = 0) {
    await this.send({
      payload: params,
      jobId: `${params.block}-${params.blockHash ?? HashZero}-${delayInSeconds}`,
    });
  }

  public async addBulk(params: BlockCheckQueueJobPayload[]) {
    await this.sendBatch(
      params.map((job) => ({
        payload: job,
        jobId: `${job.block}-${job.blockHash ?? HashZero}-${job.delay}`,
        delay: Number(job.delay) * 1000,
      }))
    );
  }
}

export const blockCheckQueueJob = new BlockCheckQueueJob();
