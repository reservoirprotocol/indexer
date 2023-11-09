import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { TopSellingCollections } from "@/models/top-selling-collections/top-selling-collections";
import { logger } from "@/common/logger";

export type TopSellingCollectionsJobPayload = {
  retry: number;
};

export class TopSellingCollectionsJob extends AbstractRabbitMqJobHandler {
  queueName = "save-top-selling-collections";
  maxRetries = 1;
  concurrency = 1;
  useSharedChannel = true;
  persistent = false;

  public async process(payload: TopSellingCollectionsJobPayload) {
    const { retry } = payload;
    const updateResult = await TopSellingCollections.updateTopSellingCollections();

    if (updateResult) {
      logger.info(
        "top-selling-collections",
        `Finished saving top-selling collections. retry=${retry}`
      );
    } else {
      logger.error(
        "top-selling-collections",
        `Something went wrong with saving top-selling collections, stopping. retry=${retry}`
      );
    }
  }

  public async addToQueue(params: TopSellingCollectionsJobPayload = { retry: 0 }) {
    params.retry = params.retry ?? 0;
    const delay = params.retry ? params.retry ** 2 * 120 * 1000 : 0;
    await this.send({ payload: params }, delay);
  }
}

export const topSellingCollectionsJob = new TopSellingCollectionsJob();
