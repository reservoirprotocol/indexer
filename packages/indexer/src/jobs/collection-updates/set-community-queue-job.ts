import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { Collections } from "@/models/collections";
import { logger } from "@/common/logger";

export type SetCommunityQueueJobPayload = {
  collection: string;
  community: string;
  attempts?: number;
};

export default class SetCommunityQueueJob extends AbstractRabbitMqJobHandler {
  queueName = "collection-set-community-queue";
  maxRetries = 10;
  concurrency = 5;

  public async process(payload: SetCommunityQueueJobPayload) {
    const { collection, community, attempts } = payload;

    const collectionData = await Collections.getById(payload.collection);
    const maxAttempts = 1500;

    if (collectionData) {
      await Collections.update(payload.collection, { community: payload.community });
      logger.info(
        this.queueName,
        `Setting community ${payload.community} to collection ${payload.collection}`
      );
    } else if (Number(attempts) < maxAttempts) {
      await this.addToQueue({
        collection,
        community,
        attempts: Number(attempts) + 1,
      });
    } else {
      logger.warn(
        this.queueName,
        `Max attempts reached for setting community ${community} to collection ${collection}`
      );
    }
  }

  public async addToQueue(params: SetCommunityQueueJobPayload, delay = 5 * 60 * 1000) {
    params.attempts = params.attempts ?? 0;
    await this.send({ payload: params }, delay);
  }
}

export const setCommunityQueueJob = new SetCommunityQueueJob();
