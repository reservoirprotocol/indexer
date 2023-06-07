import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { Collections } from "@/models/collections";
import { logger } from "@/common/logger";

export type SetCommunityQueueJobPayload = {
  collection: string;
  community: string;
  attempts?: number;
  collectionFound?: boolean;
};

export class SetCommunityQueueJob extends AbstractRabbitMqJobHandler {
  queueName = "collection-set-community-queue";
  maxRetries = 10;
  concurrency = 5;

  protected async process(payload: SetCommunityQueueJobPayload) {
    const collectionData = await Collections.getById(payload.collection);
    if (collectionData) {
      payload.collectionFound = true;
      await Collections.update(payload.collection, { community: payload.community });
      logger.info(
        this.queueName,
        `Setting community ${payload.community} to collection ${payload.collection}`
      );
    }
  }

  public async addToQueue(params: SetCommunityQueueJobPayload, delay = 5 * 60 * 1000) {
    params.attempts = params.attempts ?? 0;
    await this.send({ payload: params }, delay);
  }
}

export const setCommunityQueueJob = new SetCommunityQueueJob();

setCommunityQueueJob.on("onCompleted", async (message) => {
  const maxAttempts = 1500;
  const { collection, community, attempts } = message.payload as SetCommunityQueueJobPayload;

  if (Number(attempts) >= maxAttempts) {
    logger.warn(
      setCommunityQueueJob.queueName,
      `Max attempts reached for setting community ${community} to collection ${collection}`
    );
  } else if (!message.payload.collectionFound) {
    await setCommunityQueueJob.addToQueue({
      collection,
      community,
      attempts: Number(attempts) + 1,
    });
  }
});
