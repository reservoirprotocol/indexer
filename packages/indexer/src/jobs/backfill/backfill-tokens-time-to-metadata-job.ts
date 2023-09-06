import { config } from "@/config/index";
import { redis } from "@/common/redis";
import { idb } from "@/common/db";

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";

export class BackfillTokensTimeToMetadataJob extends AbstractRabbitMqJobHandler {
  queueName = "backfill-delete-expired-bids-elasticsearch-queue";
  maxRetries = 10;
  concurrency = 1;
  persistent = true;
  lazyMode = true;

  protected async process() {
    const limit = (await redis.get(`${this.queueName}-limit`)) || 500;

    const results = await idb.manyOrNone(
      `
            WITH x AS (
              SELECT
                tokens.contract,
                tokens.token_id,
                tokens.created_at
              FROM tokens
              WHERE tokens.metadata_indexed_at IS NULL and tokens.image IS NOT NULL
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
        limit,
      }
    );

    if (results.length > 0) {
      await this.addToQueue();
    }
  }

  public async addToQueue(delay = 1000) {
    if (!config.doElasticsearchWork) {
      return;
    }
    await this.send({ payload: {} }, delay);
  }
}

export const backfillTokensTimeToMetadataJob = new BackfillTokensTimeToMetadataJob();
