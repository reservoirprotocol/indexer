import { logger } from "@/common/logger";

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";

import { PendingAskEventsQueue } from "@/elasticsearch/indexes/asks/pending-ask-events-queue";
import { AskDocumentBuilder } from "@/elasticsearch/indexes/asks/base";
import { Orders } from "@/utils/orders";
import { idb } from "@/common/db";
import { toBuffer } from "@/common/utils";
import { config } from "@/config/index";

export enum EventKind {
  newSellOrder = "newSellOrder",
  sellOrderUpdated = "sellOrderUpdated",
  SellOrderInactive = "SellOrderInactive",
}

export type ProcessAskEventJobPayload = {
  kind: EventKind;
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

    const pendingAskEventsQueue = new PendingAskEventsQueue();

    if (kind === EventKind.SellOrderInactive) {
      try {
        await pendingAskEventsQueue.add([{ document: { id: data.id }, kind: "delete" }]);
      } catch (error) {
        logger.error(
          this.queueName,
          JSON.stringify({
            topic: "debugAskIndex",
            message: `SellOrderInactive error. id=${data.id}, error=${error}`,
            data,
            error,
          })
        );
      }
    } else {
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
              orders.quantity_filled AS "order_quantity_filled",
              orders.quantity_remaining AS "order_quantity_remaining",
              orders.fee_bps AS "order_pricing_fee_bps",
              orders.source_id_int AS "order_source_id_int",
              orders.maker AS "order_maker",
              orders.taker AS "order_taker",
              orders.kind AS "order_kind",
              orders.dynamic AS "order_dynamic",
              orders.raw_data AS "order_raw_data",
              orders.missing_royalties AS "order_missing_royalties",
              DATE_PART('epoch', LOWER(orders.valid_between)) AS "order_valid_from",
              COALESCE(
                NULLIF(DATE_PART('epoch', UPPER(orders.valid_between)), 'Infinity'),
                0
              ) AS "order_valid_until",
              orders.token_set_id AS "order_token_set_id",
              (${criteriaBuildQuery}) AS order_criteria,
              orders.created_at AS "order_created_at",
              t.*
            FROM orders
            JOIN LATERAL (
                    SELECT
                        tokens.token_id,
                        tokens.name AS "token_name",
                        tokens.image AS "token_image",
                        tokens.media AS "token_media",
                        tokens.is_flagged AS "token_is_flagged",
                        tokens.is_spam AS "token_is_spam",
                        tokens.rarity_rank AS "token_rarity_rank",
                        collections.id AS "collection_id", 
                        collections.name AS "collection_name", 
                        collections.is_spam AS "collection_is_spam",
                        (collections.metadata ->> 'imageUrl')::TEXT AS "collection_image",
                        (
                        SELECT 
                          array_agg(
                            json_build_object(
                              'key', ta.key, 'kind', attributes.kind, 
                              'value', ta.value
                            )
                          ) 
                        FROM 
                          token_attributes ta 
                          JOIN attributes ON ta.attribute_id = attributes.id 
                        WHERE 
                          ta.contract = tokens.contract
                          AND ta.token_id = tokens.token_id
                          AND ta.key != ''
                      ) AS "token_attributes" 
                    FROM tokens
                    JOIN collections on collections.id = tokens.collection_id
                    WHERE decode(substring(split_part(orders.token_set_id, ':', 2) from 3), 'hex') = tokens.contract
                    AND (split_part(orders.token_set_id, ':', 3)::NUMERIC(78, 0)) = tokens.token_id
                    LIMIT 1
                 ) t ON TRUE
            WHERE orders.id = $/orderId/
            AND orders.side = 'sell'
            AND orders.fillability_status = 'fillable'
            AND orders.approval_status = 'approved'
          `,
          { orderId: data.id }
        );

        if (rawResult) {
          askDocument = new AskDocumentBuilder().buildDocument({
            id: data.id,
            created_at: new Date(rawResult.order_created_at),
            contract: toBuffer(data.contract),
            token_id: rawResult.token_id,
            token_name: rawResult.token_name,
            token_image: rawResult.token_image,
            token_media: rawResult.token_media,
            token_is_flagged: Number(rawResult.token_is_flagged),
            token_is_spam: Number(rawResult.token_is_spam),
            token_rarity_rank: rawResult.token_rarity_rank
              ? Number(rawResult.token_rarity_rank)
              : undefined,
            token_attributes: rawResult.token_attributes,
            collection_id: rawResult.collection_id,
            collection_name: rawResult.collection_name,
            collection_image: rawResult.collection_image,
            collection_is_spam: Number(rawResult.collection_is_spam),
            order_id: data.id,
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
            order_kind: rawResult.order_kind,
            order_dynamic: rawResult.order_dynamic,
            order_raw_data: rawResult.order_raw_data,
            order_missing_royalties: rawResult.order_missing_royalties,
          });
        }
      } catch (error) {
        logger.error(
          this.queueName,
          JSON.stringify({
            topic: "debugAskIndex",
            message: `Error generating ask document. kind=${kind}, id=${data.id}, error=${error}`,
            error,
            data,
          })
        );

        throw error;
      }

      if (askDocument) {
        await pendingAskEventsQueue.add([{ document: askDocument, kind: "index" }]);
      }
    }
  }

  public async addToQueue(payloads: ProcessAskEventJobPayload[]) {
    if (!config.doElasticsearchWork) {
      return;
    }

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
