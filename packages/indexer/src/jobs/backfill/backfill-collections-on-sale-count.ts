import { idb } from "@/common/db";

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { RabbitMQMessage } from "@/common/rabbit-mq";
import _ from "lodash";
import { config } from "@/config/index";
import { recalcOnSaleCountQueueJob } from "@/jobs/collection-updates/recalc-on-sale-count-queue-job";
import { logger } from "@/common/logger";

export type BackfillCollectionsOnSaleCountJobCursorInfo = {
  collectionId: string;
};

export class BackfillCollectionsOnSaleCountJob extends AbstractRabbitMqJobHandler {
  queueName = "backfill-collections-on-sale-count";
  maxRetries = 10;
  concurrency = 1;
  persistent = false;
  lazyMode = false;
  singleActiveConsumer = true;

  public async process(payload: BackfillCollectionsOnSaleCountJobCursorInfo) {
    const { collectionId } = payload;
    const values: {
      limit: number;
      collectionId?: string;
    } = {
      limit: 1000,
    };

    if (_.isEmpty(config.spamNames)) {
      return { addToQueue: false };
    }

    let cursor = "";

    if (collectionId) {
      cursor = `AND id > $/collectionId/`;
      values.collectionId = collectionId;
    }

    const collections = await idb.manyOrNone(
      `
        SELECT id
        FROM collections
        WHERE floor_sell_id IS NOT NULL
        AND on_sale_count = 0
        ${cursor}
        ORDER BY collections.id
        LIMIT $/limit/
        `,
      values
    );

    if (collections) {
      for (const collection of collections) {
        await recalcOnSaleCountQueueJob.addToQueue({ collection: collection.id });
      }

      // Check if there are more potential users to sync
      if (collections.length == values.limit) {
        const lastItem = _.last(collections);
        logger.info(this.queueName, `Cursor ${lastItem.id}`);

        return {
          addToQueue: true,
          cursor: { collectionId: lastItem.id },
        };
      }
    }

    logger.info(this.queueName, `Done updating collections on sale count`);
    return { addToQueue: false };
  }

  public async onCompleted(
    rabbitMqMessage: RabbitMQMessage,
    processResult: {
      addToQueue: boolean;
      cursor?: BackfillCollectionsOnSaleCountJobCursorInfo;
    }
  ) {
    if (processResult.addToQueue) {
      await this.addToQueue(processResult.cursor);
    }
  }

  public async addToQueue(cursor?: BackfillCollectionsOnSaleCountJobCursorInfo, delay = 0) {
    await this.send({ payload: cursor ?? {} }, delay);
  }
}

export const backfillCollectionsOnSaleCountJob = new BackfillCollectionsOnSaleCountJob();
