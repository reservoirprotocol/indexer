import { idb } from "@/common/db";

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { RabbitMQMessage } from "@/common/rabbit-mq";
import _ from "lodash";
import { config } from "@/config/index";
import { collectionCheckSpamJob } from "@/jobs/collections-refresh/collections-check-spam-job";
import { redlock } from "@/common/redis";

export type BackfillCollectionsSpamJobCursorInfo = {
  collectionId: string;
};

export class BackfillCollectionsSpamJob extends AbstractRabbitMqJobHandler {
  queueName = "backfill-collections-spam";
  maxRetries = 10;
  concurrency = 1;
  persistent = false;
  lazyMode = false;
  singleActiveConsumer = true;

  protected async process(payload: BackfillCollectionsSpamJobCursorInfo) {
    const { collectionId } = payload;
    const values: {
      limit: number;
      collectionId?: string;
    } = {
      limit: 500,
    };

    if (_.isEmpty(config.spamNames)) {
      return { addToQueue: false };
    }

    let cursor = "";

    if (collectionId) {
      cursor = `AND id > $/collectionId/`;
      values.collectionId = collectionId;
    }

    const results = await idb.manyOrNone(
      `
        SELECT id, name
        FROM collections
        WHERE (is_spam IS NULL OR is_spam = 0)
        ${cursor}
        ORDER BY collections.id
        LIMIT $/limit/
        `,
      values
    );

    if (results) {
      for (const result of results) {
        for (const spamName of config.spamNames) {
          if (_.includes(_.toLower(result.name), spamName)) {
            await collectionCheckSpamJob.addToQueue({ collectionId: result.id });
          }
        }
      }

      // Check if there are more potential users to sync
      if (results.length == values.limit) {
        const lastItem = _.last(results);

        return {
          addToQueue: true,
          cursor: { collectionId: lastItem.id },
        };
      }
    }

    return { addToQueue: false };
  }

  public async onCompleted(
    rabbitMqMessage: RabbitMQMessage,
    processResult: {
      addToQueue: boolean;
      cursor?: BackfillCollectionsSpamJobCursorInfo;
    }
  ) {
    if (processResult.addToQueue) {
      await this.addToQueue(processResult.cursor);
    }
  }

  public async addToQueue(cursor?: BackfillCollectionsSpamJobCursorInfo, delay = 0) {
    await this.send({ payload: cursor ?? {} }, delay);
  }
}

export const backfillCollectionsSpamJob = new BackfillCollectionsSpamJob();

if (config.chainId !== 324) {
  redlock
    .acquire([`${backfillCollectionsSpamJob.getQueue()}-lock`], 60 * 60 * 24 * 30 * 1000)
    .then(async () => {
      await backfillCollectionsSpamJob.addToQueue();
    })
    .catch(() => {
      // Skip on any errors
    });
}
