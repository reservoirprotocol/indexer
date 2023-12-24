import { redb } from "@/common/db";

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { RabbitMQMessage } from "@/common/rabbit-mq";

import { resyncAttributeCacheJob } from "@/jobs/update-attribute/resync-attribute-cache-job";
import { fromBuffer } from "@/common/utils";
import { logger } from "@/common/logger";
import { acquireLock } from "@/common/redis";

export class BackfillAttributesFloorAskJob extends AbstractRabbitMqJobHandler {
  queueName = "backfill-attributes-floor-ask-queue";
  maxRetries = 10;
  concurrency = 1;
  persistent = false;
  lazyMode = false;
  singleActiveConsumer = true;

  protected async process() {
    const limit = 10;

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

    logger.info(this.queueName, `Backfill start. resultsCount=${results.length}`);

    for (const result of results) {
      const contract = fromBuffer(result.contract);
      const tokenId = result.token_id;

      const lockAcquired = await acquireLock(
        `${this.queueName}-token-lock:${contract}:${tokenId}`,
        60
      );

      if (lockAcquired) {
        await resyncAttributeCacheJob.addToQueue({ contract, tokenId }, 0);
      }

      logger.info(
        this.queueName,
        `resyncAttributeCacheJob. contract=${contract}, tokenId=${tokenId}, lockAcquired=${lockAcquired}`
      );
    }

    if (results.length === limit) {
      return { addToQueue: true };
    }

    logger.info(this.queueName, `Backfill done!`);

    return { addToQueue: false };
  }

  public async onCompleted(
    rabbitMqMessage: RabbitMQMessage,
    processResult: {
      addToQueue: boolean;
    }
  ) {
    if (processResult.addToQueue) {
      await this.addToQueue(5000);
    }
  }

  public async addToQueue(delay = 0) {
    await this.send({}, delay);
  }
}

export const backfillAttributesFloorAskJob = new BackfillAttributesFloorAskJob();
