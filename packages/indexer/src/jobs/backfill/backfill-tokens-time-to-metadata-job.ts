import { redis } from "@/common/redis";
import { idb } from "@/common/db";

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { logger } from "@/common/logger";
import _ from "lodash";
import { fromBuffer } from "@/common/utils";

export class BackfillTokensTimeToMetadataJob extends AbstractRabbitMqJobHandler {
  queueName = "backfill-tokens-time-to-metadata-queue";
  maxRetries = 10;
  concurrency = 1;
  persistent = true;
  lazyMode = true;

  public async process() {
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
              ORDER BY updated_at DESC, contract DESC, token_id DESC
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
      const lastToken = _.last(results);

      logger.info(
        this.queueName,
        `Processed ${results.length} tokens.  limit=${limit}, lastTokenContract=${fromBuffer(
          lastToken.contract
        )}, lastTokenId=${lastToken.token_id}`
      );

      await this.addToQueue();
    }
  }

  public async addToQueue(delay = 1000) {
    await this.send({}, delay);
  }
}

export const backfillTokensTimeToMetadataJob = new BackfillTokensTimeToMetadataJob();
