import { logger } from "@/common/logger";

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";

import * as asksIndex from "@/elasticsearch/indexes/asks";
import { AskDocumentBuilder } from "@/elasticsearch/indexes/asks/base";
import { Orders } from "@/utils/orders";
import { idb } from "@/common/db";
import { fromBuffer, toBuffer } from "@/common/utils";

export enum EventKind {
  newSellOrder = "newSellOrder",
}

export type ProcessAskEventJobPayload = {
  kind: EventKind.newSellOrder;
  data: OrderInfo;
  context?: string;
};

export class ProcessAskEventJob extends AbstractRabbitMqJobHandler {
  queueName = "process-ask-event-queue";
  maxRetries = 10;
  concurrency = 15;
  persistent = true;
  lazyMode = true;

  protected async process(payload: ProcessAskEventJobPayload) {
    const { kind, data } = payload;

    logger.info(
      this.queueName,
      JSON.stringify({
        message: `Start. kind=${kind}`,
        kind,
        data,
      })
    );

    let askDocument;

    try {
      const criteriaBuildQuery = Orders.buildCriteriaQuery("orders", "token_set_id", true);

      const rawResult = await idb.oneOrNone(
        `
            SELECT           
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
            WHERE orders.id = $/orderId/
          `,
        { orderId: data.id }
      );

      if (rawResult) {
        const id = `${fromBuffer(rawResult.ownership_owner)}:${data.contract}:${
          rawResult.token_id
        }:${data.id}`;

        logger.info(
          this.queueName,
          JSON.stringify({
            message: `Debug. kind=${kind}, id=${id}`,
            kind,
            data,
          })
        );

        askDocument = new AskDocumentBuilder().buildDocument({
          id,
          created_at: new Date(data.created_at),
          contract: toBuffer(data.contract),
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
          order_id: data.id,
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
      }
    } catch (error) {
      logger.error(
        this.queueName,
        JSON.stringify({
          message: `Error generating ask document. kind=${kind}, error=${error}`,
          error,
          data,
        })
      );

      throw error;
    }

    if (askDocument) {
      await asksIndex.save([askDocument]);
    }
  }

  public async addToQueue(payloads: ProcessAskEventJobPayload[]) {
    await this.sendBatch(payloads.map((payload) => ({ payload })));
  }
}

export const processAskEventJob = new ProcessAskEventJob();

interface OrderInfo {
  id: string;
  side: string;
  contract: string;
  currency: string;
  price: string;
  value: string;
  currency_price: string;
  currency_value: string;
  normalized_value: string;
  currency_normalized_value: string;
  source_id_int: number;
  quantity_filled: number;
  quantity_remaining: number;
  fee_bps: number;
  fillability_status: string;
  approval_status: string;
  created_at: string;
}
