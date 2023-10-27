import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { logger } from "@/common/logger";
import { add, fromUnixTime, getUnixTime } from "date-fns";
import { DailyVolume } from "@/models/daily-volumes/daily-volume";
import * as ActivitiesIndex from "@/elasticsearch/indexes/activities";
import { ActivityType } from "@/elasticsearch/indexes/activities/base";
import _ from "lodash";

export type UpdateCollectionDailyVolumeJobPayload = {
  newCollectionId: string;
  contract: string;
};

export default class UpdateCollectionDailyVolumeJob extends AbstractRabbitMqJobHandler {
  queueName = "update-collection-daily-volume-queue";
  maxRetries = 10;
  concurrency = 1;
  backoff = {
    type: "fixed",
    delay: 5000,
  } as BackoffStrategy;
  lazyMode = true;
  useSharedChannel = true;

  protected async process(payload: UpdateCollectionDailyVolumeJobPayload) {
    const result = await ActivitiesIndex.search({
      types: [ActivityType.sale],
      contracts: [payload.contract],
      collections: [payload.newCollectionId],
      sortBy: "timestamp",
      sortDirection: "asc",
      limit: 1,
    });

    if (!_.isEmpty(result.activities)) {
      const currentTime = getUnixTime(new Date());
      let saleDate = fromUnixTime(result.activities[0].timestamp);
      saleDate.setUTCHours(0, 0, 0, 0);

      // Recalculate daily volumes from the first sale date
      while (getUnixTime(saleDate) < currentTime - 24 * 60 * 60) {
        await DailyVolume.calculateDay(getUnixTime(saleDate), true, payload.newCollectionId);
        logger.info(
          this.queueName,
          `Calculate daily volume for date ${saleDate.toISOString()} collection ${
            payload.newCollectionId
          } `
        );
        saleDate = add(saleDate, { days: 1 });
        saleDate.setUTCHours(0, 0, 0, 0);
      }

      // Update the collections table
      const updated = await DailyVolume.updateCollections(true, payload.newCollectionId);
      logger.info(
        this.queueName,
        `Updated collections table collection ${payload.newCollectionId}`
      );

      if (updated) {
        logger.info(
          this.queueName,
          `Finished recalculating daily volumes for collection ${payload.newCollectionId}`
        );
      }
    }
  }

  public async addToQueue(params: UpdateCollectionDailyVolumeJobPayload, delay = 60 * 30 * 1000) {
    await this.send({ payload: params, jobId: params.newCollectionId }, delay);
  }
}

export const updateCollectionDailyVolumeJob = new UpdateCollectionDailyVolumeJob();
