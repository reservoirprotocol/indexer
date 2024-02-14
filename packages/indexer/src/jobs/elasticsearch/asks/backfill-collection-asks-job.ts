import { config } from "@/config/index";
import { logger } from "@/common/logger";
import { idb } from "@/common/db";
import { redis } from "@/common/redis";

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";

import { fromBuffer, toBuffer } from "@/common/utils";
import { backfillTokenAsksJob } from "@/jobs/elasticsearch/asks/backfill-token-asks-job";

export class BackfillCollectionAsksJob extends AbstractRabbitMqJobHandler {
  queueName = "backfill-collection-asks-queue";
  maxRetries = 10;
  concurrency = 5;
  persistent = true;

  public async process(payload: BackfillCollectionAsksJobPayload) {
    logger.info(
      this.queueName,
      JSON.stringify({
        message: `Start. collectionId=${payload.collectionId}`,
        payload,
      })
    );

    let nextCursor;
    let query;
    const limit = Number(await redis.get(`${this.queueName}-limit`)) || 500;

    try {
      let continuationFilter = "";

      if (payload.cursor) {
        continuationFilter = `AND (tokens.contract, tokens.token_id) > ($/contract/, $/tokenId/)`;
      }

      query = `
            SELECT contract, token_id
            FROM tokens
            WHERE tokens.collection_id = $/collectionId/
            AND tokens.floor_sell_value IS NULL 
            ${continuationFilter}
            ORDER BY contract, token_id
            LIMIT $/limit/;
          `;

      const rawResults = await idb.manyOrNone(query, {
        collectionId: payload.collectionId,
        contract: payload.cursor?.contract ? toBuffer(payload.cursor.contract) : undefined,
        tokenId: payload.cursor?.tokenId,
        limit,
      });

      if (rawResults.length) {
        logger.info(
          this.queueName,
          JSON.stringify({
            message: `Backfilling tokens. collectionId=${payload.collectionId}, tokenCount=${rawResults.length}`,
            payload,
          })
        );

        await backfillTokenAsksJob.addToQueueBatch(
          rawResults.map((rawResult) => ({
            contract: rawResult.contract,
            tokenId: rawResult.tokenId,
            onlyActive: false,
          }))
        );

        if (rawResults.length === limit) {
          const lastResult = rawResults[rawResults.length - 1];

          nextCursor = {
            contract: fromBuffer(lastResult.contract),
            tokenId: lastResult.token_id,
          };

          await backfillCollectionAsksJob.addToQueue(payload.collectionId, nextCursor);
        }
      }
    } catch (error) {
      logger.error(
        this.queueName,
        JSON.stringify({
          message: `Error generating ask documents. error=${error}`,
          error,
          payload,
          query,
        })
      );

      throw error;
    }
  }

  public async addToQueue(
    collectionId: string,
    cursor?: {
      contract: string;
      tokenId: string;
    }
  ) {
    if (!config.doElasticsearchWork) {
      return;
    }

    await this.send({
      payload: {
        collectionId,
        cursor,
      },
    });
  }
}

export const backfillCollectionAsksJob = new BackfillCollectionAsksJob();

export type BackfillCollectionAsksJobPayload = {
  collectionId: string;
  cursor?: {
    contract: string;
    tokenId: string;
  };
};
