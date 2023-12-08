import { redb } from "@/common/db";

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { RabbitMQMessage } from "@/common/rabbit-mq";

import { resyncAttributeCacheJob } from "@/jobs/update-attribute/resync-attribute-cache-job";
import { fromBuffer } from "@/common/utils";

export class BackfillAttributesFloorAskJob extends AbstractRabbitMqJobHandler {
  queueName = "backfill-attributes-floor-ask-queue";
  maxRetries = 10;
  concurrency = 1;
  persistent = false;
  lazyMode = false;
  singleActiveConsumer = true;

  protected async process() {
    const limit = 100;

    const results = await redb.manyOrNone(
      `
        SELECT DISTINCT ta.contract, ta.token_id
        FROM 
          attributes a
          JOIN token_attributes ta ON a.id = ta.attribute_id
          JOIN tokens t ON ta.contract = t.contract AND ta.token_id = t.token_id
        WHERE a.floor_sell_value IS NOT NULL
        AND a.floor_sell_id IS NULL
        AND t.floor_sell_id IS NOT NULL
        LIMIT $/limit/
          `,
      {
        limit,
      }
    );

    for (const result of results) {
      await resyncAttributeCacheJob.addToQueue(
        { contract: fromBuffer(result.contract), tokenId: result.token_id },
        0
      );
    }

    // if (results.rowCount === limit) {
    //   return { addToQueue: true };
    // }

    return { addToQueue: false };
  }

  public async onCompleted(
    rabbitMqMessage: RabbitMQMessage,
    processResult: {
      addToQueue: boolean;
    }
  ) {
    if (processResult.addToQueue) {
      await this.addToQueue();
    }
  }

  public async addToQueue(delay = 0) {
    await this.send({}, delay);
  }
}

export const backfillAttributesFloorAskJob = new BackfillAttributesFloorAskJob();
