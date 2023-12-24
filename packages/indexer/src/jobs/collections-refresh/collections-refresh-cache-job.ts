import { redb } from "@/common/db";
import { fromBuffer } from "@/common/utils";
import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { Collections } from "@/models/collections";
import { resyncAttributeCacheJob } from "@/jobs/update-attribute/resync-attribute-cache-job";
import _ from "lodash";

export type CollectionRefreshCacheJobPayload = {
  collection: string;
};

export default class CollectionRefreshCacheJob extends AbstractRabbitMqJobHandler {
  queueName = "collections-refresh-cache";
  maxRetries = 10;
  concurrency = 10;
  persistent = false;

  protected async process(payload: CollectionRefreshCacheJobPayload) {
    const { collection } = payload;

    // Refresh the contract floor sell and top bid
    await Collections.revalidateCollectionTopBuy(collection);

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
      { collection }
    );

    if (!_.isEmpty(result)) {
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
