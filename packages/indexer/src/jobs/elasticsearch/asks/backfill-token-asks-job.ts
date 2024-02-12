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

  public async process(payload: BackfillTokenAsksJobPayload) {
    logger.info(
      this.queueName,
      JSON.stringify({
        message: `Start. contract=${payload.contract}, tokenId=${payload.tokenId}`,
        payload,
      })
    );

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
            ${AskCreatedEventHandler.buildBaseQuery(payload.onlyActive)}
            AND token_set_id = $/tokenSetId/
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

            if (
              payload.contract === "0x524cab2ec69124574082676e6f654a18df49a048" &&
              payload.tokenId === "1"
            ) {
              askEvents.push({
                kind: "delete",
                info: { id: eventHandler.getAskId() },
              } as AskEvent);
            } else {
              askEvents.push({
                kind: "index",
                info: { id: eventHandler.getAskId(), document: askDocument },
              } as AskEvent);
            }
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
          message: `Done. contract=${payload.contract}, tokenId=${payload.tokenId}, indexedAsks=${bulkIndexOps.length}, deletedAsks=${bulkDeleteOps.length}`,
          payload,
          nextCursor,
          indexName: AskIndex.getIndexName(),
          bulkIndexOpsResponseHasErrors: bulkIndexOpsResponse?.errors,
          bulkIndexOpsResponse: bulkIndexOpsResponse?.errors ? bulkIndexOpsResponse : undefined,
          bulkDeleteOpsResponseHasErrors: bulkDeleteOpsResponse?.errors,
          bulkDeleteOpsResponse: bulkDeleteOpsResponse?.errors ? bulkDeleteOpsResponse : undefined,
        })
      );

      await backfillTokenAsksJob.addToQueue(
        payload.contract,
        payload.tokenId,
        payload.onlyActive,
        nextCursor
      );
    } else {
      logger.info(
        this.queueName,
        JSON.stringify({
          message: `No Ask Events. contract=${payload.contract}, tokenId=${payload.tokenId}`,
          payload,
        })
      );
    }
  }

  public async addToQueue(
    contract: string,
    tokenId: string,
    onlyActive: boolean,
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
        onlyActive,
        cursor,
      },
    });
  }
}

export const backfillTokenAsksJob = new BackfillTokenAsksJob();

export type BackfillTokenAsksJobPayload = {
  contract: string;
  tokenId: string;
  onlyActive: boolean;
  cursor?: {
    createdAt: string;
    id: string;
  };
};
