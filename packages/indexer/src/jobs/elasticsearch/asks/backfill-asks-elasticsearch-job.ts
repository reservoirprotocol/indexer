import { config } from "@/config/index";
import { logger } from "@/common/logger";
import { idb } from "@/common/db";
import { redis } from "@/common/redis";

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";

import * as AskIndex from "@/elasticsearch/indexes/asks";
import { elasticsearch } from "@/common/elasticsearch";
import { AskCreatedEventHandler } from "@/elasticsearch/indexes/asks/event-handlers/ask-created";
import { AskEvent } from "@/elasticsearch/indexes/asks/pending-ask-events-queue";

export class BackfillAsksElasticsearchJob extends AbstractRabbitMqJobHandler {
  queueName = "backfill-asks-elasticsearch-queue";
  maxRetries = 10;
  concurrency = 5;
  persistent = true;
  lazyMode = true;

  protected async process(payload: BackfillAsksElasticsearchJobPayload) {
    if (!payload.cursor) {
      logger.info(
        this.queueName,
        JSON.stringify({
          topic: "debugAskIndex",
          message: `Start. fromTimestamp=${payload.fromTimestamp}, onlyActive=${payload.onlyActive}`,
          payload,
        })
      );
    }

    let nextCursor;

    const askEvents: AskEvent[] = [];

    try {
      let continuationFilter = "";
      let fromTimestampFilter = "";

      const limit = Number(await redis.get(`${this.queueName}-limit`)) || 1000;

      if (payload.cursor) {
        continuationFilter = `AND (orders.updated_at, orders.id) > (to_timestamp($/updatedAt/), $/id/)`;
      }

      if (payload.fromTimestamp) {
        fromTimestampFilter = `AND (orders.updated_at) > (to_timestamp($/fromTimestamp/))`;
      }

      const query = `
            ${AskCreatedEventHandler.buildBaseQuery()}
              WHERE orders.side = 'sell'
              ${
                payload.onlyActive
                  ? `AND orders.fillability_status = 'fillable' AND orders.approval_status = 'approved'`
                  : ""
              }
              AND kind != 'element-erc1155'
              ${continuationFilter}
              ${fromTimestampFilter}
              ORDER BY updated_at, id
              LIMIT $/limit/;
          `;

      const rawResults = await idb.manyOrNone(query, {
        fromTimestamp: payload.fromTimestamp,
        updatedAt: payload.cursor?.updatedAt,
        id: payload.cursor?.id,
        limit,
      });

      if (rawResults.length) {
        for (const rawResult of rawResults) {
          const eventHandler = new AskCreatedEventHandler(rawResult.order_id);

          const askDocument = eventHandler.buildDocument(rawResult);

          askEvents.push({
            kind: "index",
            info: { id: eventHandler.getAskId(), document: askDocument },
          });
        }

        const lastResult = rawResults[rawResults.length - 1];

        nextCursor = {
          updatedAt: lastResult.updated_ts,
          id: lastResult.order_id,
        };
      }
    } catch (error) {
      logger.error(
        this.queueName,
        JSON.stringify({
          topic: "debugAskIndex",
          message: `Error generating ask document. error=${error}`,
          error,
          payload,
        })
      );

      throw error;
    }

    if (askEvents.length) {
      const bulkIndexOps = askEvents
        .filter((askEvent) => askEvent.kind == "index")
        .flatMap((askEvent) => [
          { index: { _index: AskIndex.getIndexName(), _id: askEvent.info.id } },
          askEvent.info.id,
        ]);
      const bulkDeleteOps = askEvents
        .filter((askEvent) => askEvent.kind == "delete")
        .flatMap((askEvent) => ({
          delete: { _index: AskIndex.getIndexName(), _id: askEvent.info.id },
        }));

      if (bulkIndexOps.length) {
        await elasticsearch.bulk({
          body: bulkIndexOps,
        });
      }

      if (bulkDeleteOps.length) {
        await elasticsearch.bulk({
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
        })
      );

      await backfillAsksElasticsearchJob.addToQueue(
        payload.fromTimestamp,
        payload.onlyActive,
        nextCursor
      );
    }
  }

  public async addToQueue(
    fromTimestamp?: number,
    onlyActive?: boolean,
    cursor?: {
      updatedAt: string;
      id: string;
    }
  ) {
    if (!config.doElasticsearchWork) {
      return;
    }

    await this.send({
      payload: {
        fromTimestamp,
        onlyActive,
        cursor,
      },
    });
  }
}

export const backfillAsksElasticsearchJob = new BackfillAsksElasticsearchJob();

export type BackfillAsksElasticsearchJobPayload = {
  fromTimestamp?: number;
  onlyActive?: boolean;
  cursor?: {
    updatedAt: string;
    id: string;
  };
};
