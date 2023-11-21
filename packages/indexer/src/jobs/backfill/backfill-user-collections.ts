import { idb } from "@/common/db";

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { RabbitMQMessage } from "@/common/rabbit-mq";
import _ from "lodash";
import { fromBuffer, toBuffer } from "@/common/utils";
import { AddressZero } from "@ethersproject/constants";
import { redis } from "@/common/redis";
import { format } from "date-fns";
import { resyncUserCollectionsJob } from "@/jobs/nft-balance-updates/reynsc-user-collections-job";
import { logger } from "@/common/logger";

export type BackfillUserCollectionsJobCursorInfo = {
  owner: string;
  acquiredAt: string;
};

export class BackfillUserCollectionsJob extends AbstractRabbitMqJobHandler {
  queueName = "backfill-user-collections";
  maxRetries = 10;
  concurrency = 1;
  persistent = false;
  lazyMode = false;
  singleActiveConsumer = true;

  protected async process(payload: BackfillUserCollectionsJobCursorInfo) {
    const { owner, acquiredAt } = payload;
    const redisKey = "sync-user-collections";
    const values: { limit: number; AddressZero: Buffer; owner?: Buffer; acquiredAt?: string } = {
      limit: 200,
      AddressZero: toBuffer(AddressZero),
    };

    let counter = 0;
    let cursor = "";

    if (owner) {
      cursor = `AND (owner, acquired_at) > ($/owner/, $/acquiredAt/)`;
      values.owner = toBuffer(owner);
      values.acquiredAt = acquiredAt;
    }

    const results = await idb.manyOrNone(
      `
          SELECT nb.owner, acquired_at::text, t.collection_id
          FROM nft_balances nb
          JOIN LATERAL (
             SELECT collection_id
             FROM tokens
             WHERE nb.contract = tokens.contract
             AND nb.token_id = tokens.token_id
          ) t ON TRUE
          WHERE nb.owner != $/AddressZero/
          AND amount > 0
          ${cursor}
          ORDER BY nb.owner, acquired_at
          LIMIT $/limit/
          `,
      values
    );

    if (results) {
      for (const result of results) {
        // Check if the user was already synced for this collection
        const memberKey = `${fromBuffer(result.owner)}:${result.collection_id}`;
        if ((await redis.hexists(redisKey, memberKey)) === 0) {
          const date = format(new Date(_.now()), "yyyy-MM-dd HH:mm:ss");
          await redis.hset(redisKey, memberKey, date);
          ++counter;

          // Trigger resync for the user in the collection
          await resyncUserCollectionsJob.addToQueue({
            user: fromBuffer(result.owner),
            collectionId: result.collection_id,
          });
        }
      }
    }

    logger.info(this.queueName, `total updated ${counter}`);

    // Check if there are more potential users to sync
    if (results.length == values.limit) {
      const lastItem = _.last(results);
      logger.info(this.queueName, `continue updating from ${JSON.stringify(lastItem)}`);

      return {
        addToQueue: true,
        cursor: { owner: fromBuffer(lastItem.owner), acquiredAt: lastItem.acquired_at },
      };
    }

    return { addToQueue: false };
  }

  public async onCompleted(
    rabbitMqMessage: RabbitMQMessage,
    processResult: {
      addToQueue: boolean;
      cursor?: BackfillUserCollectionsJobCursorInfo;
    }
  ) {
    if (processResult.addToQueue) {
      await this.addToQueue(processResult.cursor);
    }
  }

  public async addToQueue(cursor?: BackfillUserCollectionsJobCursorInfo, delay = 0) {
    await this.send({ payload: cursor }, delay);
  }
}

export const backfillUserCollectionsJob = new BackfillUserCollectionsJob();
