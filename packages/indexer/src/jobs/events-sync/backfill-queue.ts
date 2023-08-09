import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { eventsSyncHistoricalJob } from "@/jobs/events-sync/historical-queue";

export type EventsBackfillJobPayload = {
  fromBlock?: number;
  toBlock?: number;
  range?: number;
  backfillId?: string;
  syncEventsToMainDB?: boolean;
};

export class EventsBackfillJob extends AbstractRabbitMqJobHandler {
  queueName = "events-backfill-job";
  maxRetries = 30;
  concurrency = 1;
  consumerTimeout = 60 * 1000;
  backoff = {
    type: "fixed",
    delay: 1000,
  } as BackoffStrategy;

  constructor() {
    super();
  }
  protected async process(payload: EventsBackfillJobPayload) {
    try {
      let fromBlock, toBlock, maxBlock;
      let backfillId;

      logger.info(this.queueName, `Processing payload: ${JSON.stringify(payload)}`);


      // initialize backfill
      if (payload.fromBlock && payload.toBlock && !payload.backfillId) {
        let range = payload.range;
        if (!range) {
          range = 1000;
        }
        // create backfillId
        backfillId = `${payload.fromBlock}-${payload.toBlock}-${range}-${Date.now()}`;
        fromBlock = payload.fromBlock;

        // if fromBlock + range > payload.toBlock, fromBlock = payload.toBlock
        toBlock =
          payload.fromBlock + range > payload.toBlock ? payload.toBlock : payload.fromBlock + range;

        await redis.set(`backfill:fromBlock:${backfillId}`, `${fromBlock}`);
        await redis.set(`backfill:latestBlock:${backfillId}`, `${fromBlock}`);
        await redis.set(`backfill:toBlock:${backfillId}`, `${toBlock}`);
        await redis.set(`backfill:maxBlock:${backfillId}`, `${maxBlock}`);
        await redis.set(`backfill:range:${backfillId}`, `${range}`);
      } else if (payload.backfillId) {
        // backfillId exists, continue backfill by checking if the previous portion is finished, if not, continue backfill
        backfillId = payload.backfillId;
        const oldFromBlock = Number(await redis.get(`backfill:fromBlock:${backfillId}`));
        const oldToBlock = Number(await redis.get(`backfill:toBlock:${backfillId}`));
        maxBlock = Number(await redis.get(`backfill:maxBlock:${backfillId}`));

        // compare the status, if fromBlock >= toBlock, backfill portion finished, continue backfill next portion
        // if fromBlock < toBlock, continue backfill
        // if oldToBlock >= maxBlock, backfill finished
        if (oldToBlock >= maxBlock) {
          // backfill finished
          logger.info(this.queueName, `Backfill finished: ${backfillId}`);
          return;
        } else if (oldFromBlock < oldToBlock) {
          // backfill not finished, add job to queue to check again later
          await this.addToQueue(
            {
              backfillId,
              syncEventsToMainDB: payload.syncEventsToMainDB,
            },
            30000
          );
          return;
        }

        const range = Number(await redis.get(`backfill:range:${backfillId}`));

        fromBlock = oldFromBlock + range;
        toBlock = oldToBlock + range > maxBlock ? maxBlock : oldToBlock + range;

        await redis.set(`backfill:fromBlock:${backfillId}`, `${fromBlock}`);
        await redis.set(`backfill:latestBlock:${backfillId}`, `${fromBlock}`);
        await redis.set(`backfill:toBlock:${backfillId}`, `${toBlock}`);
      } else {
        logger.warn(this.queueName, `Invalid payload: ${JSON.stringify(payload)}`);
        return;
      }

      for (let i = fromBlock; i <= toBlock; i++) {
        await eventsSyncHistoricalJob.addToQueue({
          block: i,
          syncEventsToMainDB: payload.syncEventsToMainDB,
        });
      }

      await this.addToQueue(
        {
          backfillId: backfillId,
          syncEventsToMainDB: payload.syncEventsToMainDB,
        },
        30000
      );
    } catch (error) {
      logger.warn(this.queueName, `Events historical syncing failed: ${error}`);
      throw error;
    }
  }

  public async addToQueue(params: EventsBackfillJobPayload, delay = 0) {
    await this.send({ payload: params }, delay);
  }
}

export const eventsBackfillJob = new EventsBackfillJob();
