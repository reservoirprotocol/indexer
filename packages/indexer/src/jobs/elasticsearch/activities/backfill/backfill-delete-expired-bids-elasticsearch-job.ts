import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { config } from "@/config/index";
import * as ActivitiesIndex from "@/elasticsearch/indexes/activities";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { ActivityType } from "@/elasticsearch/indexes/activities/base";
import { redb } from "@/common/db";

export type BackfillDeleteExpiredBidsElasticsearchJobPayload = {
  cursor: string | null;
  dryRun: boolean;
};

export class BackfillDeleteExpiredBidsElasticsearchJob extends AbstractRabbitMqJobHandler {
  queueName = "backfill-delete-expired-bids-elasticsearch-queue";
  maxRetries = 10;
  concurrency = 1;
  persistent = true;
  lazyMode = true;

  protected async process(payload: BackfillDeleteExpiredBidsElasticsearchJobPayload) {
    const { cursor, dryRun } = payload;

    if (cursor == null) {
      logger.info(this.queueName, `Start - V3. payload=${JSON.stringify(payload)}`);
    }

    const limit = (await redis.get(`${this.queueName}-limit`)) || 1000;

    const { activities, continuation } = await ActivitiesIndex.search(
      {
        types: [ActivityType.bid],
        continuation: cursor,
        sortBy: "timestamp",
        limit: Number(limit),
      },
      true
    );

    if (activities.length > 0) {
      const orderIdToActivityId = Object.fromEntries(
        activities.map((activity) => [activity.order!.id, activity.id])
      );

      const orderIds = activities.map((activity) => activity.order!.id);

      const existingOrders = await redb.manyOrNone(
        `
            SELECT id from orders
            WHERE orders.id IN ($/orderIds:csv/)
          `,
        {
          orderIds,
        }
      );

      const existingOrderIds = existingOrders.map((existingOrder) => existingOrder.id);

      const toBeDeletedActivityIds = [];

      for (const orderId of orderIds) {
        if (!existingOrderIds.includes(orderId)) {
          toBeDeletedActivityIds.push(orderIdToActivityId[orderId]);
        }
      }

      if (toBeDeletedActivityIds.length && !dryRun) {
        await ActivitiesIndex.deleteActivitiesById(toBeDeletedActivityIds);

        logger.info(
          this.queueName,
          `Deleted - V3. payload=${JSON.stringify(payload)}, activitiesCount=${
            activities.length
          }, activitiesToBeDeletedCount=${
            toBeDeletedActivityIds.length
          }, lastActivity=${JSON.stringify(activities[0])}, continuation=${continuation}`
        );
      }

      if (continuation) {
        await this.addToQueue(continuation, dryRun);
      } else {
        logger.info(
          this.queueName,
          `End - No Continuation - V3. payload=${JSON.stringify(payload)}`
        );
      }
    } else {
      logger.info(this.queueName, `End - No Activities - V3. payload=${JSON.stringify(payload)}`);
    }
  }

  public async addToQueue(cursor?: string | null, dryRun = true, delay = 1000) {
    if (!config.doElasticsearchWork) {
      return;
    }
    await this.send({ payload: { cursor, dryRun } }, delay);
  }
}

export const backfillDeleteExpiredBidsElasticsearchJob =
  new BackfillDeleteExpiredBidsElasticsearchJob();
