import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { publishWebsocketEvent } from "@/common/websocketPublisher";
import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { Orders } from "@/utils/orders";
import { idb } from "@/common/db";
import { Sources } from "@/models/sources";
import { SourcesEntity } from "@/models/sources/sources-entity";
import { fromBuffer, getNetAmount } from "@/common/utils";
import { getJoiPriceObject } from "@/common/joi";
import _ from "lodash";
import * as Sdk from "@reservoir0x/sdk";

export type AskWebsocketEventsTriggerQueueJobPayload = {
  data: OrderWebsocketEventInfo;
};

const changedMapping = {
  fillability_status: "status",
  approval_status: "status",
  quantity_filled: "quantityFilled",
  quantity_remaining: "quantityRemaining",
  expiration: "expiration",
  price: "price.gross.amount",
};

export class AskWebsocketEventsTriggerQueueJob extends AbstractRabbitMqJobHandler {
  queueName = "ask-websocket-events-trigger-queue";
  maxRetries = 5;
  concurrency = 10;
  consumerTimeout = 60000;
  backoff = {
    type: "exponential",
    delay: 1000,
  } as BackoffStrategy;

  protected async process(payload: AskWebsocketEventsTriggerQueueJobPayload) {
    const { data } = payload;

    try {
      const changed = [];

      const eventType = data.trigger === "insert" ? "ask.created" : "ask.updated";

      if (data.trigger === "update" && data.before) {
        for (const key in changedMapping) {
          if (data.before[key as keyof OrderInfo] !== data.after[key as keyof OrderInfo]) {
            changed.push(changedMapping[key as keyof typeof changedMapping]);
          }
        }

        if (!changed.length) {
          logger.info(
            this.queueName,
            `No changes detected for event. before=${JSON.stringify(
              data.before
            )}, after=${JSON.stringify(data.after)}`
          );

          // return;
        }
      }

      const criteriaBuildQuery = Orders.buildCriteriaQuery("orders", "token_set_id", true);

      const rawResult = await idb.oneOrNone(
        `
            SELECT
              orders.id,
              orders.kind,
              orders.side,
              orders.token_set_id,
              orders.token_set_schema_hash,
              orders.contract,
              orders.maker,
              orders.taker,
              orders.currency,
              orders.price,
              orders.value,
              orders.currency_price,
              orders.currency_value,
              orders.normalized_value,
              orders.currency_normalized_value,
              orders.missing_royalties,
              orders.nonce,
              orders.dynamic,
              DATE_PART('epoch', LOWER(orders.valid_between)) AS valid_from,
              COALESCE(NULLIF(DATE_PART('epoch', UPPER(orders.valid_between)), 'Infinity'), 0) AS valid_until,
              orders.source_id_int,
              orders.quantity_filled,
              orders.quantity_remaining,
              coalesce(orders.fee_bps, 0) AS fee_bps,
              orders.fee_breakdown,
              COALESCE(NULLIF(DATE_PART('epoch', orders.expiration), 'Infinity'), 0) AS expiration,
              orders.is_reservoir,
              orders.raw_data,
              orders.created_at,
              orders.updated_at,
              orders.originated_at,
              (
                CASE
                  WHEN orders.fillability_status = 'filled' THEN 'filled'
                  WHEN orders.fillability_status = 'cancelled' THEN 'cancelled'
                  WHEN orders.fillability_status = 'expired' THEN 'expired'
                  WHEN orders.fillability_status = 'no-balance' THEN 'inactive'
                  WHEN orders.approval_status = 'no-approval' THEN 'inactive'
                  ELSE 'active'
                END
              ) AS status,
              (${criteriaBuildQuery}) AS criteria
            FROM orders
            WHERE orders.id = $/orderId/
          `,
        { orderId: data.after.id }
      );

      const sources = await Sources.getInstance();

      const feeBreakdown = rawResult.fee_breakdown;
      const feeBps = rawResult.fee_bps;

      let source: SourcesEntity | undefined;

      if (rawResult.token_set_id?.startsWith("token")) {
        const [, contract, tokenId] = rawResult.token_set_id.split(":");
        source = sources.get(Number(rawResult.source_id_int), contract, tokenId);
      } else {
        source = sources.get(Number(rawResult.source_id_int));
      }

      const result = {
        id: rawResult.id,
        kind: rawResult.kind,
        side: rawResult.side,
        status: rawResult.status,
        tokenSetId: rawResult.token_set_id,
        tokenSetSchemaHash: fromBuffer(rawResult.token_set_schema_hash),
        nonce: rawResult.nonce,
        contract: fromBuffer(rawResult.contract),
        maker: fromBuffer(rawResult.maker),
        taker: fromBuffer(rawResult.taker),
        price: await getJoiPriceObject(
          {
            gross: {
              amount: rawResult.currency_price ?? rawResult.price,
              nativeAmount: rawResult.price,
            },
            net: {
              amount: getNetAmount(
                rawResult.currency_price ?? rawResult.price,
                _.min([rawResult.fee_bps, 10000])
              ),
              nativeAmount: getNetAmount(rawResult.price, _.min([rawResult.fee_bps, 10000])),
            },
          },
          rawResult.currency
            ? fromBuffer(rawResult.currency)
            : rawResult.side === "sell"
            ? Sdk.Common.Addresses.Native[config.chainId]
            : Sdk.Common.Addresses.WNative[config.chainId],
          undefined
        ),
        validFrom: Number(rawResult.valid_from),
        validUntil: Number(rawResult.valid_until) || 0,
        quantityFilled: Number(rawResult.quantity_filled),
        quantityRemaining: Number(rawResult.quantity_remaining),
        criteria: rawResult.criteria,
        source: {
          id: source?.address,
          domain: source?.domain,
          name: source?.getTitle(),
          icon: source?.getIcon(),
          url: source?.metadata.url,
        },
        feeBps: Number(feeBps.toString()),
        feeBreakdown: feeBreakdown,
        expiration: Number(rawResult.expiration),
        isReservoir: rawResult.is_reservoir,
        isDynamic: Boolean(rawResult.dynamic || rawResult.kind === "sudoswap"),
        createdAt: new Date(rawResult.created_at).toISOString(),
        updatedAt: new Date(rawResult.updated_at).toISOString(),
        originatedAt: new Date(rawResult.originated_at).toISOString(),
        rawData: rawResult.raw_data,
      };

      await publishWebsocketEvent({
        event: eventType,
        tags: {
          contract: fromBuffer(rawResult.contract),
          source: result.source.domain || "unknown",
          maker: fromBuffer(rawResult.maker),
          taker: fromBuffer(rawResult.taker),
        },
        changed,
        data: result,
        offset: data.offset,
      });
    } catch (error) {
      logger.error(
        this.queueName,
        `Error processing websocket event. data=${JSON.stringify(data)}, error=${JSON.stringify(
          error
        )}`
      );

      throw error;
    }
  }

  public async addToQueue(events: AskWebsocketEventsTriggerQueueJobPayload[]) {
    if (!config.doWebsocketServerWork) {
      return;
    }

    await this.sendBatch(
      events.map((event) => ({
        payload: event,
      }))
    );
  }
}

export type EventInfo = {
  data: OrderWebsocketEventInfo;
};

interface OrderInfo {
  id: string;
  kind: string;
  side: string;
  status: string;
  token_set_id: string;
  token_set_schema_hash: string;
  contract: string;
  maker: string;
  taker: string;
  currency: string;
  price: string;
  currency_price: string;
  nonce: string;
  dynamic: boolean;
  valid_between: string;

  source_id_int: number;
  quantity_filled: string;
  quantity_remaining: string;
  fee_bps: string;

  fee_breakdown: string;
  expiration: string;
  is_reservoir: boolean | null;
  raw_data: string;
  created_at: string;
  originated_at: string;
  fillability_status: string;
  approval_status: string;
}

export type OrderWebsocketEventInfo = {
  before: OrderInfo;
  after: OrderInfo;
  trigger: "insert" | "update";
  offset: string;
};

export const askWebsocketEventsTriggerQueueJob = new AskWebsocketEventsTriggerQueueJob();
