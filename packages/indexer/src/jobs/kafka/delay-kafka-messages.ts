/* eslint-disable @typescript-eslint/no-explicit-any */

import { Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { KafkaProducer, KafkaProducerRecord } from "@/common/kafka";

const QUEUE_NAME = "delay-kafka-messages-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    removeOnComplete: 1000,
    removeOnFail: 1000,
    timeout: 120000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
// if (config.doBackgroundWork) {
const worker = new Worker(
  QUEUE_NAME,
  async (job) => {
    const { record } = job.data;
    delete record.delay;

    // await KafkaProducer.connect();
    await KafkaProducer.send(record);
  },
  { connection: redis.duplicate(), concurrency: 100 }
);

worker.on("error", (error) => {
  logger.error(QUEUE_NAME, `Worker errored: ${error}`);
});
// }

export const addToQueue = async (record: KafkaProducerRecord, delayMs: number) => {
  await queue.add(randomUUID(), { record }, { delay: delayMs });
};
