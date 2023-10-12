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
  useSharedChannel = true;
  persistent = false;

  protected async process(payload: OneDayVolumeJobPayload) {
    let { retry } = payload;

    const updateResult = await DailyVolume.update1Day();

    if (updateResult) {
      logger.info(
        "day-1-volumes",
        `Finished updating the 1day volume on collections table. retry=${retry}`
      );
    } else {
      if (retry < 5) {
        logger.warn(
          "day-1-volumes",
          `Something went wrong with updating the 1day volume on collections, will retry in a couple of minutes. retry=${retry}`
        );
        retry++;

        await this.addToQueue({ retry });
      } else {
        logger.error(
          "day-1-volumes",
          `Something went wrong with retrying during updating the 1day volume on collection, stopping. retry=${retry}`
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
