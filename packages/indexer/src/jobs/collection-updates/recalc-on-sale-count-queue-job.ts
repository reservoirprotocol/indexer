import { idb } from "@/common/db";
import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import * as AsksIndex from "@/elasticsearch/indexes/asks";

export type RecalcOnSaleCountQueueJobPayload = {
  collection: string;
  force?: boolean;
};

export default class RecalcOnSaleCountQueueJob extends AbstractRabbitMqJobHandler {
  queueName = "recalc-onsale-token-count-queue";
  maxRetries = 10;
  concurrency = 10;
  backoff = {
    type: "exponential",
    delay: 20000,
  } as BackoffStrategy;

  public async process(payload: RecalcOnSaleCountQueueJobPayload) {
    const { collection } = payload;

    const onSaleCount = await AsksIndex.getCollectionOnSaleCount({ collection });

    // No more tokens to count, update collections table
    const query = `
          UPDATE "collections"
          SET "on_sale_count" = $/onSaleCount/,
              "updated_at" = now()
          WHERE "id" = $/collection/
          AND ("on_sale_count" IS DISTINCT FROM $/onSaleCount/)
      `;

    await idb.none(query, {
      collection,
      onSaleCount,
    });
  }

  public async addToQueue(payload: RecalcOnSaleCountQueueJobPayload, delay = 0) {
    await this.send(
      {
        payload: payload,
        jobId: payload.force ? undefined : `${payload.collection}:${delay}`,
      },
      payload.force ? 0 : delay
    );
  }
}

export const recalcOnSaleCountQueueJob = new RecalcOnSaleCountQueueJob();
