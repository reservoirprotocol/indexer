import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { DailyVolume } from "@/models/daily-volumes/daily-volume";
import { logger } from "@/common/logger";

export type DailyVolumeJobPayload = {
  startTime?: number | null;
  ignoreInsertedRows?: boolean;
  retry?: number;
};

export default class DailyVolumeJob extends AbstractRabbitMqJobHandler {
  queueName = "calculate-daily-volumes";
  maxRetries = 10;
  concurrency = 1;
  useSharedChannel = true;
  persistent = false;
  timeout = 2 * 60 * 60 * 1000;

  protected async process(payload: DailyVolumeJobPayload) {
    const startTime = Number(payload.startTime);
    const ignoreInsertedRows = payload.ignoreInsertedRows;
    let retry = Number(payload.retry);

    await DailyVolume.calculateDay(startTime, ignoreInsertedRows);

    if (await DailyVolume.tickLock()) {
      logger.info(
        "daily-volumes",
        `All daily volumes are finished processing, updating the collections table. startTime=${startTime}, retry=${retry}`
      );

      const updated = await DailyVolume.updateCollections(true);

      if (updated) {
        logger.info(
          "daily-volumes",
          `Finished updating the collections table. startTime=${startTime}, retry=${retry}`
        );
      } else {
        if (retry < 5) {
          logger.warn(
            "daily-volumes",
            `Something went wrong with updating the collections, will retry in a couple of minutes. startTime=${startTime}, retry=${retry}`
          );

          await this.addToQueue({ startTime, ignoreInsertedRows: true, retry: ++retry });
        } else {
          logger.error(
            "daily-volumes",
            `Something went wrong with retrying during updating the collection, stopping. startTime=${startTime}, retry=${retry}`
          );
        }
      }
    }
  }

  public async addToQueue(params: DailyVolumeJobPayload = {}) {
    let dayBeginning = new Date();

    if (!params.startTime) {
      dayBeginning = new Date();
      dayBeginning.setUTCHours(0, 0, 0, 0);
      params.startTime = dayBeginning.getTime() / 1000 - 24 * 3600;
    }

    params.retry = params.retry ?? 0;
    params.ignoreInsertedRows = params.ignoreInsertedRows ?? true;

    const delay = params.retry ? 5 * 60 * 1000 : 0;
    await this.send({ payload: params }, delay);
  }
}

export const dailyVolumeJob = new DailyVolumeJob();
