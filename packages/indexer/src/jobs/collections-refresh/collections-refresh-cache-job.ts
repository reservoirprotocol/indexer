import { redb } from "@/common/db";
import { fromBuffer } from "@/common/utils";
import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { Collections } from "@/models/collections";
import { resyncAttributeCacheJob } from "@/jobs/update-attribute/resync-attribute-cache-job";

export type CollectionRefreshCacheJobPayload = {
  collection: string;
};

export class CollectionRefreshCacheJob extends AbstractRabbitMqJobHandler {
  queueName = "collections-refresh-cache";
  maxRetries = 10;
  concurrency = 10;

  protected async process(payload: CollectionRefreshCacheJobPayload) {
    // Refresh the contract floor sell and top bid
    await Collections.revalidateCollectionTopBuy(payload.collection);

    const result = await redb.manyOrNone(
      `
          SELECT
            tokens.contract,
            tokens.token_id
          FROM tokens
          WHERE tokens.collection_id = $/collection/
            AND tokens.floor_sell_id IS NOT NULL
          LIMIT 10000
        `,
      { collection: payload.collection }
    );
    if (result) {
      await Collections.recalculateContractFloorSell(fromBuffer(result[0].contract));
      for (const { contract, token_id } of result) {
        await resyncAttributeCacheJob.addToQueue(
          { contract: fromBuffer(contract), tokenId: token_id },
          0
        );
      }
    }
  }

  public async addToQueue(params: CollectionRefreshCacheJobPayload) {
    await this.send({ payload: params });
  }
}

export const collectionRefreshCacheJob = new CollectionRefreshCacheJob();
