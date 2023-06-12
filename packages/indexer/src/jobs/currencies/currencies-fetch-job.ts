import { idb } from "@/common/db";
import { toBuffer } from "@/common/utils";
import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { tryGetCurrencyDetails } from "@/utils/currencies";

export type CurrenciesFetchJobPayload = {
  currency: string;
};

export class CurrenciesFetchJob extends AbstractRabbitMqJobHandler {
  queueName = "currencies-fetch";
  maxRetries = 10;
  concurrency = 10;
  backoff = {
    type: "exponential",
    delay: 10000,
  } as BackoffStrategy;

  protected async process(payload: CurrenciesFetchJobPayload) {
    const details = await tryGetCurrencyDetails(payload.currency);
    await idb.none(
      `
          UPDATE currencies SET
            name = $/name/,
            symbol = $/symbol/,
            decimals = $/decimals/,
            metadata = $/metadata:json/
          WHERE contract = $/contract/
        `,
      {
        contract: toBuffer(payload.currency),
        ...details,
      }
    );
  }

  public async addToQueue(params: CurrenciesFetchJobPayload) {
    await this.send({ payload: params, jobId: params.currency });
  }
}

export const currenciesFetchJob = new CurrenciesFetchJob();
