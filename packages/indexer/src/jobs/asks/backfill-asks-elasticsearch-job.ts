import { config } from "@/config/index";
import { logger } from "@/common/logger";
import { idb } from "@/common/db";
import { redis } from "@/common/redis";

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";

import { Orders } from "@/utils/orders";
import { AskDocumentBuilder } from "@/elasticsearch/indexes/asks/base";
import * as asksIndex from "@/elasticsearch/indexes/asks";

export class BackfillAsksElasticsearchJob extends AbstractRabbitMqJobHandler {
  queueName = "backfill-asks-elasticsearch-queue";
  maxRetries = 10;
  concurrency = 1;
  persistent = true;
  lazyMode = true;

  protected async process(payload: BackfillAsksElasticsearchJobPayload) {
    logger.info(
      this.queueName,
      JSON.stringify({
        topic: "debugAskIndex",
        message: `Start.`,
      })
    );

    let nextCursor;

    const askDocuments = [];

    try {
      let continuationFilter = "";
      let fromTimestampFilter = "";

      const limit = Number(await redis.get(`${this.queueName}-limit`)) || 1000;

      if (payload.cursor) {
        continuationFilter = `AND (orders.updated_at, orders.id) > (to_timestamp($/updatedAt/), $/id/)`;
      }

      if (payload.fromTimestamp) {
        fromTimestampFilter = `AND (orders.updated_at) > (to_timestamp($/updatedAt/))`;
      }

      const criteriaBuildQuery = Orders.buildCriteriaQuery("orders", "token_set_id", true);

      const rawResults = await idb.manyOrNone(
        `
            SELECT        
              orders.contract AS "contract",     
              orders.id AS "order_id",    
              orders.price AS "order_pricing_price",
              orders.currency AS "order_pricing_currency",
              orders.currency_price AS "order_pricing_currency_price",
              orders.value AS "order_pricing_value",
              orders.currency_value AS "order_pricing_currency_value",
              orders.normalized_value AS "order_pricing_normalized_value",
              orders.currency_normalized_value AS "order_pricing_currency_normalized_value",
              orders.quantity_filled AS "order_quantity_filled",
              orders.quantity_remaining AS "order_quantity_remaining",
              orders.fee_bps AS "order_pricing_fee_bps",
              orders.source_id_int AS "order_source_id_int",
              orders.maker AS "order_maker",
              orders.taker AS "order_taker",
              DATE_PART('epoch', LOWER(orders.valid_between)) AS "order_valid_from",
              COALESCE(
                NULLIF(DATE_PART('epoch', UPPER(orders.valid_between)), 'Infinity'),
                0
              ) AS "order_valid_until",
              orders.token_set_id AS "order_token_set_id",
              (${criteriaBuildQuery}) AS order_criteria,
              extract(epoch from orders.updated_at) updated_ts,
              t.*
            FROM orders
            JOIN LATERAL (
                    SELECT
                        tokens.token_id,
                        tokens.name AS "token_name",
                        tokens.image AS "token_image",
                        tokens.media AS "token_media",
                        collections.id AS "collection_id",
                        collections.name AS "collection_name",
                        (collections.metadata ->> 'imageUrl')::TEXT AS "collection_image"
                    FROM tokens
                    JOIN collections on collections.id = tokens.collection_id
                    WHERE decode(substring(split_part(orders.token_set_id, ':', 2) from 3), 'hex') = tokens.contract
                    AND (split_part(orders.token_set_id, ':', 3)::NUMERIC(78, 0)) = tokens.token_id
                    LIMIT 1
                 ) t ON TRUE
                  WHERE orders.side = 'sell'
                  AND orders.fillability_status = 'fillable'
                  AND orders.approval_status = 'approved'
<<<<<<< HEAD
=======
                  AND kind != 'element-erc1155'
>>>>>>> main
                  ${continuationFilter}
                  ${fromTimestampFilter}
                  ORDER BY updated_at, id
                  LIMIT $/limit/;
          `,
        {
          fromTimestamp: payload.fromTimestamp,
          updatedAt: payload.cursor?.updatedAt,
          id: payload.cursor?.id,
          limit,
        }
      );

      if (rawResults.length) {
        for (const rawResult of rawResults) {
          const askDocument = new AskDocumentBuilder().buildDocument({
            id: rawResult.order_id,
            created_at: new Date(rawResult.updated_ts * 1000),
            contract: rawResult.contract,
            token_id: rawResult.token_id,
            token_name: rawResult.token_name,
            token_image: rawResult.token_image,
            token_media: rawResult.token_media,
            collection_id: rawResult.collection_id,
            collection_name: rawResult.collection_name,
            collection_image: rawResult.collection_image,
            order_id: rawResult.order_id,
            order_source_id_int: Number(rawResult.order_source_id_int),
            order_criteria: rawResult.order_criteria,
            order_quantity_filled: Number(rawResult.order_quantity_filled),
            order_quantity_remaining: Number(rawResult.order_quantity_remaining),
            order_pricing_currency: rawResult.order_pricing_currency,
            order_pricing_fee_bps: rawResult.order_pricing_fee_bps,
            order_pricing_price: rawResult.order_pricing_price,
            order_pricing_currency_price: rawResult.order_pricing_currency_price,
            order_pricing_value: rawResult.order_pricing_value,
            order_pricing_currency_value: rawResult.order_pricing_currency_value,
            order_pricing_normalized_value: rawResult.order_pricing_normalized_value,
            order_pricing_currency_normalized_value:
              rawResult.order_pricing_currency_normalized_value,
            order_maker: rawResult.order_maker,
            order_taker: rawResult.order_taker,
            order_token_set_id: rawResult.order_token_set_id,
            order_valid_from: Number(rawResult.order_valid_from),
            order_valid_until: Number(rawResult.order_valid_until),
          });

          askDocuments.push(askDocument);
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

    if (askDocuments.length) {
      await asksIndex.save(askDocuments);

      await backfillAsksElasticsearchJob.addToQueue(payload.fromTimestamp, nextCursor);
    }
  }

  public async addToQueue(
    fromTimestamp?: number,
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
        cursor,
      },
    });
  }
}

export const backfillAsksElasticsearchJob = new BackfillAsksElasticsearchJob();

export type BackfillAsksElasticsearchJobPayload = {
  fromTimestamp?: number;
  cursor?: {
    updatedAt: string;
    id: string;
  };
};
