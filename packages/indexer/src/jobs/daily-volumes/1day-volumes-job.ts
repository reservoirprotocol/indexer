import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { DailyVolume } from "@/models/daily-volumes/daily-volume";
import { logger } from "@/common/logger";

export type OneDayVolumeJobPayload = {
  retry: number;
};

export class OneDayVolumeJob extends AbstractRabbitMqJobHandler {
  queueName = "calculate-1day-volumes";
  maxRetries = 10;
  concurrency = 1;

  protected async process(payload: OneDayVolumeJobPayload) {
    const updateResult = await DailyVolume.update1Day();

    if (updateResult) {
      logger.info(
        "daily-volumes",
        `Finished updating the 1day volume on collections table. retry=${payload.retry}`
      );
    } else {
      if (payload.retry < 5) {
        logger.warn(
          "daily-volumes",
          `Something went wrong with updating the 1day volume on collections, will retry in a couple of minutes. retry=${payload.retry}`
        );
        payload.retry++;

        await this.addToQueue(payload);
      } else {
        logger.error(
          "daily-volumes",
          `Something went wrong with retrying during updating the 1day volume on collection, stopping. retry=${payload.retry}`
        );
      }
    }
  }

  public async addToQueue(params: OneDayVolumeJobPayload = { retry: 0 }) {
    params.retry = params.retry ?? 0;
    const delay = params.retry ? params.retry ** 2 * 120 * 1000 : 0;
    await this.send({ payload: params }, delay);
  }
}

export const oneDayVolumeJob = new OneDayVolumeJob();
