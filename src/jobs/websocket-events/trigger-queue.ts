import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import {
  NewTopBidWebsocketEventInfo,
  NewTopBidWebsocketEvent,
} from "@/jobs/websocket-events/events/new-top-bid-websocket-event";
import {
  NewActivityWebsocketEvent,
  NewActivityWebsocketEventInfo,
} from "@/jobs/websocket-events/events/new-activity-websocket-event";

import { randomUUID } from "crypto";
import _ from "lodash";
import tracer from "@/common/tracer";

const QUEUE_NAME = "websocket-events-trigger-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 5,
    removeOnComplete: 1000,
    removeOnFail: 1000,
    timeout: 60000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork && config.doWebsocketServerWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { kind, data } = job.data as EventInfo;

      switch (kind) {
        case EventKind.NewTopBid:
          await tracer.trace(
            "triggerEvent",
            { resource: "NewTopBidWebsocketEvent", tags: { event: data } },
            () => NewTopBidWebsocketEvent.triggerEvent(data)
          );
          break;
        case EventKind.NewActivity:
          await tracer.trace(
            "triggerEvent",
            { resource: "NewActivityWebsocketEvent", tags: { event: data } },
            () => NewActivityWebsocketEvent.triggerEvent(data)
          );
          break;
      }
    },
    { connection: redis.duplicate(), concurrency: 20 }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export enum EventKind {
  NewTopBid = "new-top-bid",
  NewActivity = "new-activity",
}

export type EventInfo =
  | {
      kind: EventKind.NewTopBid;
      data: NewTopBidWebsocketEventInfo;
    }
  | {
      kind: EventKind.NewActivity;
      data: NewActivityWebsocketEventInfo;
    };

export const addToQueue = async (events: EventInfo[]) => {
  if (!config.doWebsocketServerWork) {
    return;
  }

  await queue.addBulk(
    _.map(events, (event) => ({
      name: randomUUID(),
      data: event,
    }))
  );
};
