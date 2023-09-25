import { redis } from "@/common/redis";
import { idb } from "@/common/db";

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";

import { fromBuffer, now, toBuffer } from "@/common/utils";
import { mintQueueJob } from "@/jobs/token-updates/mint-queue-job";

export type CursorInfo = {
  contract: string;
  tokenId: string;
};

export type BackfillTokensWithMissingCollectionJobPayload = {
  contract?: string;
  cursor?: CursorInfo;
};

export class BackfillTokensWithMissingCollectionJob extends AbstractRabbitMqJobHandler {
  queueName = "backfill-tokens-with-missing-collection-queue";
  maxRetries = 10;
  concurrency = 1;
  persistent = true;
  lazyMode = true;
  singleActiveConsumer = true;

  protected async process(payload: BackfillTokensWithMissingCollectionJobPayload) {
    const { contract, cursor } = payload;

    let contractFilter = "";
    let continuationFilter = "";

    const limit = (await redis.get(`${this.queueName}-limit`)) || 1;

    if (contract) {
      contractFilter = `AND tokens.contract = $/contract/`;
    }

    if (cursor) {
      continuationFilter = `AND (tokens.contract, tokens.token_id) > ($/cursorContract/, $/cursorTokenId/)`;
    }

    const results = await idb.manyOrNone(
      `
          SELECT
            tokens.contract,
            tokens.token_id
          FROM tokens
          WHERE tokens.collection_id IS NULL
          ${contractFilter}
          ${continuationFilter}
          ORDER BY tokens.contract, tokens.token_id
          LIMIT $/limit/
        `,
      {
        cursorContract: cursor?.contract ? toBuffer(cursor.contract) : undefined,
        cursorTokenId: cursor?.tokenId,
        contract: contract ? toBuffer(contract) : undefined,
        limit,
      }
    );

    const currentTime = now();

    await mintQueueJob.addToQueue(
      results.map((r) => ({
        contract: fromBuffer(r.contract),
        tokenId: r.token_id,
        mintedTimestamp: currentTime,
      }))
    );

    if (results.length >= limit) {
      const lastResult = results[results.length - 1];

      const nextCursor = {
        contract: fromBuffer(lastResult.contract),
        tokenId: lastResult.token_id,
      };

      await this.addToQueue(contract, nextCursor);
    }
  }

  public async addToQueue(contract?: string, cursor?: CursorInfo, delay = 1000) {
    await this.send(
      {
        payload: {
          contract,
          cursor,
        },
      },
      delay
    );
  }
}

export const backfillTokensWithMissingCollectionJob = new BackfillTokensWithMissingCollectionJob();
