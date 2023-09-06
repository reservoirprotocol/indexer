import _ from "lodash";

import { config } from "@/config/index";
import { redis } from "@/common/redis";
import { redb } from "@/common/db";
import { fromBuffer, toBuffer } from "@/common/utils";

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";

export type BackfillTokensTimeToMetadataJobPayload = {
  cursor?: CursorInfo;
};

export type CursorInfo = {
  contract: string;
  tokenId: string;
};

export class BackfillTokensTimeToMetadataJob extends AbstractRabbitMqJobHandler {
  queueName = "backfill-delete-expired-bids-elasticsearch-queue";
  maxRetries = 10;
  concurrency = 1;
  persistent = true;
  lazyMode = true;

  protected async process(payload: BackfillTokensTimeToMetadataJobPayload) {
    const { cursor } = payload;

    let continuationFilter = "";

    if (cursor) {
      continuationFilter = `AND (tokens.contract, tokens.token_id) > ($/contract/, $/tokenId/)`;
    }

    const limit = (await redis.get(`${this.queueName}-limit`)) || 3000;

    const results = await redb.manyOrNone(
      `
            WITH x AS (
              SELECT
                tokens.contract,
                tokens.token_id,
                tokens.created_at
              FROM tokens
              WHERE tokens.metadata_indexed_at IS NULL
              ${continuationFilter}
              ORDER BY contract, token_id
              LIMIT $/limit/
            )
            UPDATE tokens SET
              metadata_indexed_at = x.created_at,
              metadata_initialized_at = x.created_at,
              metadata_updated_at = x.created_at
            FROM x
            WHERE tokens.contract = x.contract AND  tokens.token_id = x.token_id
            RETURNING x.contract, x.token_id
          `,
      {
        contract: cursor?.contract ? toBuffer(cursor?.contract) : null,
        tokenId: cursor?.tokenId,
        limit,
      }
    );

    let nextCursor;

    if (results.length > 0) {
      const lastToken = _.last(results);

      nextCursor = {
        contract: fromBuffer(lastToken.contract),
        tokenId: lastToken.token_id,
      };

      await this.addToQueue(nextCursor);
    }
  }

  public async addToQueue(cursor?: CursorInfo, delay = 1000) {
    if (!config.doElasticsearchWork) {
      return;
    }
    await this.send({ payload: { cursor } }, delay);
  }
}

export const backfillTokensTimeToMetadataJob = new BackfillTokensTimeToMetadataJob();
