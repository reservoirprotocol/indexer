import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { acquireLock, releaseLock } from "@/common/redis";
import { ArchiveBidEvents } from "@/jobs/data-archive/archive-classes/archive-bid-events";
import { ArchiveManager } from "@/jobs/data-archive/archive-manager";
import { logger } from "@/common/logger";
import { ArchiveBidOrders } from "@/jobs/data-archive/archive-classes/archive-bid-orders";

export type ProcessArchiveDataJobPayload = {
  tableName: string;
  type?: string;
  nextBatchTime?: string | null;
};

export class ProcessArchiveDataJob extends AbstractRabbitMqJobHandler {
  queueName = "process-archive-data-queue";
  maxRetries = 10;
  concurrency = 1;
  backoff = {
    type: "fixed",
    delay: 5000,
  } as BackoffStrategy;

  protected async process(payload: ProcessArchiveDataJobPayload) {
    const { tableName, type, nextBatchTime } = payload;
    let lock = false;

    const shouldRunDataArchiving = false;
    if (!shouldRunDataArchiving) {
      return;
    }
    switch (tableName) {
      case "bid_events":
        // Archive bid events
        if (await acquireLock(this.getLockName(tableName), 60 * 10 - 5)) {
          lock = true;

          try {
            const archiveBidEvents = new ArchiveBidEvents();
            await ArchiveManager.archive(archiveBidEvents);
          } catch (error) {
            logger.error(this.queueName, `Bid events archive errored: ${error}`);
          }
        }
        break;

      case "orders":
        // Archive bid events
        if (
          type === "bids" &&
          (await acquireLock(this.getLockName(`${tableName}${nextBatchTime}`), 60 * 10 - 5))
        ) {
          lock = true;

          try {
            const archiveBidOrders = new ArchiveBidOrders();
            await ArchiveManager.archive(archiveBidOrders, nextBatchTime);
          } catch (error) {
            logger.error(this.queueName, `Bid orders archive errored: ${error}`);
          }
        }
        break;
    }

    if (lock) {
      switch (tableName) {
        case "bid_events":
          {
            await releaseLock(this.getLockName(tableName)); // Release the lock

            // Check if archiving should continue
            const archiveBidEvents = new ArchiveBidEvents();
            if (await archiveBidEvents.continueArchive()) {
              await this.addToQueue({ tableName });
            }
          }

          break;

        case "orders": {
          if (type === "bids") {
            await releaseLock(this.getLockName(`${tableName}${nextBatchTime}`)); // Release the lock

            // Check if archiving should continue
            const archiveBidOrders = new ArchiveBidOrders();
            if (!nextBatchTime && (await archiveBidOrders.continueArchive())) {
              await this.addToQueue({ tableName, type });
            }
          }
          break;
        }
      }
    }
  }

  public getLockName(tableName: string) {
    return `${tableName}-archive-cron-lock`;
  }

  public async addToQueue(params: ProcessArchiveDataJobPayload) {
    params.type = params.type ?? "";
    params.nextBatchTime = params.nextBatchTime ?? null;

    await this.send({ payload: params });
  }
}

export const processArchiveDataJob = new ProcessArchiveDataJob();
