import { config } from "@/config/index";
import { logger } from "@/common/logger";
import { idb } from "@/common/db";
import { redis } from "@/common/redis";

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";

import { Orders } from "@/utils/orders";
import { fromBuffer } from "@/common/utils";
import { TokenListingBuilder } from "@/elasticsearch/indexes/token-listings/base";
import * as tokenListingsIndex from "@/elasticsearch/indexes/token-listings";

export class BackfillTokenListingsElasticsearchJob extends AbstractRabbitMqJobHandler {
  queueName = "backfill-token-listings-elasticsearch-queue";
  maxRetries = 10;
  concurrency = 1;
  persistent = true;
  lazyMode = true;

  protected async process(payload: BackfillTokenListingsElasticsearchJobPayload) {
    logger.info(
      this.queueName,
      JSON.stringify({
        topic: "backfill-token-listings",
        message: `Start.`,
        payload,
      })
    );

    let nextCursor;

    const tokenListings = [];

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
              (orders.quantity_filled + orders.quantity_remaining) AS "order_quantity",
              orders.fee_bps AS "order_pricing_fee_bps",
              orders.source_id_int AS "order_source_id_int",
              (${criteriaBuildQuery}) AS order_criteria,
              extract(epoch from orders.updated_at) updated_ts,
              nb.*,
              t.*
            FROM orders
            JOIN LATERAL (
                    SELECT
                        nft_balances.owner AS "ownership_owner",
                        nft_balances.amount AS "ownership_amount",
                        nft_balances.acquired_at AS "ownership_acquired_at"
                    FROM nft_balances
                    WHERE orders.maker = nft_balances.owner
                    AND decode(substring(split_part(orders.token_set_id, ':', 2) from 3), 'hex') = nft_balances.contract
                    AND (split_part(orders.token_set_id, ':', 3)::NUMERIC(78, 0)) = nft_balances.token_id
                    LIMIT 1
                 ) nb ON TRUE
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
                  AND (orders.taker = '\\x0000000000000000000000000000000000000000' OR orders.taker IS NULL)
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
          const id = `${fromBuffer(rawResult.ownership_owner)}:${fromBuffer(rawResult.contract)}:${
            rawResult.token_id
          }:${rawResult.order_id}`;

          const tokenListing = new TokenListingBuilder().buildDocument({
            id,
            created_at: new Date(rawResult.created_at),
            contract: rawResult.contract,
            ownership_address: rawResult.ownership_owner,
            ownership_amount: Number(rawResult.ownership_amount),
            ownership_acquired_at: new Date(rawResult.ownership_acquired_at),
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
            order_quantity: Number(rawResult.order_quantity),
            order_pricing_currency: rawResult.order_pricing_currency,
            order_pricing_fee_bps: rawResult.order_pricing_fee_bps,
            order_pricing_price: rawResult.order_pricing_price,
            order_pricing_currency_price: rawResult.order_pricing_currency_price,
            order_pricing_value: rawResult.order_pricing_value,
            order_pricing_currency_value: rawResult.order_pricing_currency_value,
            order_pricing_normalized_value: rawResult.order_pricing_normalized_value,
            order_pricing_currency_normalized_value:
              rawResult.order_pricing_currency_normalized_value,
          });

          tokenListings.push(tokenListing);
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
          message: `Error generating token listing. error=${error}`,
          error,
          payload,
        })
      );

      throw error;
    }

    if (tokenListings.length) {
      await tokenListingsIndex.save(tokenListings);

      await backfillTokenListingsElasticsearchJob.addToQueue(payload.fromTimestamp, nextCursor);
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

export const backfillTokenListingsElasticsearchJob = new BackfillTokenListingsElasticsearchJob();

export type BackfillTokenListingsElasticsearchJobPayload = {
  fromTimestamp?: number;
  cursor?: {
    updatedAt: string;
    id: string;
  };
};
