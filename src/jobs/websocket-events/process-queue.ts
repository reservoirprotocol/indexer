import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import { NewTopBidWebsocketEvent } from "@/jobs/websocket-events/events/new-top-bid-websocket-event";
import { randomUUID } from "crypto";
import _ from "lodash";

const QUEUE_NAME = "websocket-events-process-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
    removeOnComplete: 1000,
    removeOnFail: 10000,
    timeout: 60000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { kind, data } = job.data as EventInfo;

      switch (kind) {
        case EventKind.tokenSetTopBidChanged:
          if (data.orderId) {
            await NewTopBidWebsocketEvent.triggerEvent({
              orderId: data.orderId,
            });
          }

          break;
      }
    },
    { connection: redis.duplicate(), concurrency: 5 }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export enum EventKind {
  tokenSetTopBidChanged = "token-set-top-bid-changed",
}

export type EventInfo = {
  kind: EventKind.tokenSetTopBidChanged;
  data: {
    tokenSetId: string;
    orderId: string | null;
  };
};

export const addToQueue = async (events: EventInfo[]) => {
  await queue.addBulk(
    _.map(events, (event) => ({
      name: randomUUID(),
      data: event,
    }))
  );
};
