import { config } from "@/config/index";
import { logger } from "@/common/logger";
import { idb } from "@/common/db";
import { redis } from "@/common/redis";

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";

import * as AskIndex from "@/elasticsearch/indexes/asks";
import { elasticsearch } from "@/common/elasticsearch";
import { AskCreatedEventHandler } from "@/elasticsearch/indexes/asks/event-handlers/ask-created";
import { AskEvent } from "@/elasticsearch/indexes/asks/pending-ask-events-queue";

export class BackfillTokenAsksJob extends AbstractRabbitMqJobHandler {
  queueName = "backfill-token-asks-queue";
  maxRetries = 10;
  concurrency = 5;
  persistent = true;
  lazyMode = true;

  protected async process(payload: BackfillTokenAsksJobPayload) {
    let nextCursor;
    let query;

    const askEvents: AskEvent[] = [];

    try {
      let continuationFilter = "";

      const limit = Number(await redis.get(`${this.queueName}-limit`)) || 1000;

      if (payload.cursor) {
        continuationFilter = `AND (orders.created_at, orders.id) > (to_timestamp($/createdAt/), $/id/)`;
      }

      query = `
            ${AskCreatedEventHandler.buildBaseQuery(true)}
            WHERE token_set_id = $/tokenSetId/
            ${continuationFilter}
            ORDER BY created_at, id
            LIMIT $/limit/;
          `;

      const rawResults = await idb.manyOrNone(query, {
        tokenSetId: `token:${payload.contract}:${payload.tokenId}`,
        createdAt: payload.cursor?.createdAt,
        id: payload.cursor?.id,
        limit,
      });

      if (rawResults.length) {
        for (const rawResult of rawResults) {
          try {
            const eventHandler = new AskCreatedEventHandler(rawResult.order_id);
            const askDocument = eventHandler.buildDocument(rawResult);

            askEvents.push({
              kind: "index",
              info: { id: eventHandler.getAskId(), document: askDocument },
            } as AskEvent);
          } catch (error) {
            logger.error(
              this.queueName,
              JSON.stringify({
                topic: "debugAskIndex",
                message: `Error generating ask document. error=${error}`,
                error,
                payload,
                rawResult,
              })
            );
          }
        }

        const lastResult = rawResults[rawResults.length - 1];

        nextCursor = {
          createdAt: lastResult.created_ts,
          id: lastResult.order_id,
        };
      }
    } catch (error) {
      logger.error(
        this.queueName,
        JSON.stringify({
          topic: "debugAskIndex",
          message: `Error generating ask documents. error=${error}`,
          error,
          payload,
          query,
        })
      );

      throw error;
    }

    if (askEvents.length) {
      const bulkIndexOps = askEvents
        .filter((askEvent) => askEvent.kind == "index")
        .flatMap((askEvent) => [
          { index: { _index: AskIndex.getIndexName(), _id: askEvent.info.id } },
          askEvent.info.document,
        ]);

      const bulkDeleteOps = askEvents
        .filter((askEvent) => askEvent.kind == "delete")
        .flatMap((askEvent) => ({
          delete: { _index: AskIndex.getIndexName(), _id: askEvent.info.id },
        }));

      let bulkIndexOpsResponse;

      if (bulkIndexOps.length) {
        bulkIndexOpsResponse = await elasticsearch.bulk({
          body: bulkIndexOps,
        });
      }

      let bulkDeleteOpsResponse;

      if (bulkDeleteOps.length) {
        bulkDeleteOpsResponse = await elasticsearch.bulk({
          body: bulkDeleteOps,
        });
      }

      logger.info(
        this.queueName,
        JSON.stringify({
          topic: "debugAskIndex",
          message: `Indexed ${bulkIndexOps.length} asks. Deleted ${bulkDeleteOps.length} asks`,
          payload,
          nextCursor,
          indexName: AskIndex.getIndexName(),
          bulkIndexOpsResponseHasErrors: bulkIndexOpsResponse?.errors,
          bulkIndexOpsResponse: bulkIndexOpsResponse?.errors ? bulkIndexOpsResponse : undefined,
          bulkDeleteOpsResponseHasErrors: bulkDeleteOpsResponse?.errors,
          bulkDeleteOpsResponse: bulkDeleteOpsResponse?.errors ? bulkDeleteOpsResponse : undefined,
        })
      );

      await backfillTokenAsksJob.addToQueue(payload.contract, payload.tokenId, nextCursor);
    }
  }

  public async addToQueue(
    contract: string,
    tokenId: number,
    cursor?: {
      createdAt: string;
      id: string;
    }
  ) {
    if (!config.doElasticsearchWork) {
      return;
    }

    await this.send({
      payload: {
        contract,
        tokenId,
        cursor,
      },
    });
  }
}

export const backfillTokenAsksJob = new BackfillTokenAsksJob();

export type BackfillTokenAsksJobPayload = {
  contract: string;
  tokenId: number;
  cursor?: {
    createdAt: string;
    id: string;
  };
};
