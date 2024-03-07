import { idb } from "@/common/db";
import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import _ from "lodash";
import { toBuffer } from "@/common/utils";

export type RecalcTokenCountQueueJobPayload = {
  collection: string;
  fromTokenId?: string;
  totalCurrentCount?: number;
  force?: boolean;
};

export default class RecalcTokenCountQueueJob extends AbstractRabbitMqJobHandler {
  queueName = "collection-recalc-token-count-queue";
  maxRetries = 10;
  concurrency = 10;
  backoff = {
    type: "exponential",
    delay: 20000,
  } as BackoffStrategy;

  public async process(payload: RecalcTokenCountQueueJobPayload) {
    const { collection, fromTokenId } = payload;
    const limit = 5000;
    const continuation = fromTokenId ? `AND token_id > $/fromTokenId/` : "";

    let { totalCurrentCount } = payload;
    totalCurrentCount = Number(totalCurrentCount ?? 0);
    const [contract] = _.split(collection, ":"); // Get the contract from the collection

    const tokenQuery = `
      SELECT token_id
      FROM tokens
      WHERE collection_id = $/collection/
      AND contract = $/contract/
      AND (remaining_supply > 0 OR remaining_supply IS NULL)
      ${continuation}
      ORDER BY contract, token_id
      LIMIT ${limit}
    `;

    const tokenCountQuery = `
      SELECT COUNT(*) AS count
      FROM (${tokenQuery}) AS tokens
    `;

    const { count } = await idb.one(tokenCountQuery, {
      collection,
      fromTokenId,
      contract: toBuffer(contract),
    });

    totalCurrentCount += Number(count); // Update the total current count

    // If there are more tokens to count
    if (Number(count) >= limit) {
      // Get the last token_id from the current batch
      const lastTokenQuery = `
        SELECT token_id
        FROM (${tokenQuery}) AS tokens
        ORDER BY token_id DESC
        LIMIT 1
      `;

      const lastToken = await idb.oneOrNone(lastTokenQuery, {
        collection,
        fromTokenId,
        contract: toBuffer(contract),
      });

      if (lastToken) {
        // Trigger the next count job from the last token_id of the current batch
        await this.addToQueue(
          {
            collection,
            fromTokenId: lastToken.token_id,
            totalCurrentCount,
          },
          _.random(1, 10) * 1000
        );
      }
    } else {
      // No more tokens to count, update collections table
      const query = `
          UPDATE "collections"
          SET "token_count" = $/totalCurrentCount/,
              "updated_at" = now()
          WHERE "id" = $/collection/
          AND ("token_count" IS DISTINCT FROM $/totalCurrentCount/)
      `;

      await idb.none(query, {
        collection,
        totalCurrentCount,
      });
    }
  }

  public async addToQueue(payload: RecalcTokenCountQueueJobPayload, delay = 5 * 60 * 1000) {
    payload.totalCurrentCount = payload.totalCurrentCount ?? 0;

    await this.send(
      {
        payload,
        jobId: payload.force ? undefined : `${payload.collection}:${payload.fromTokenId}`,
      },
      payload.force ? 0 : delay
    );
  }
}

export const recalcTokenCountQueueJob = new RecalcTokenCountQueueJob();
