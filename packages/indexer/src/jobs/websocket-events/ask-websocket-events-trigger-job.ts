import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { publishWebsocketEvent } from "@/common/websocketPublisher";
import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { Orders } from "@/utils/orders";
import { idb } from "@/common/db";
import { Sources } from "@/models/sources";
import { SourcesEntity } from "@/models/sources/sources-entity";
import { getNetAmount } from "@/common/utils";
import { getJoiPriceObject, getJoiSourceObject } from "@/common/joi";
import _ from "lodash";
import * as Sdk from "@reservoir0x/sdk";
import { formatStatus, formatValidBetween } from "@/jobs/websocket-events/utils";

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
  valid_between: ["validFrom", "validUntil"],
};

export class AskWebsocketEventsTriggerQueueJob extends AbstractRabbitMqJobHandler {
  queueName = "ask-websocket-events-trigger-queue";
  maxRetries = 5;
  concurrency = 10;
  timeout = 60000;
  backoff = {
    type: "exponential",
    delay: 1000,
  } as BackoffStrategy;

  public async process(payload: AskWebsocketEventsTriggerQueueJobPayload) {
    const { data } = payload;

    try {
      const changed = [];

      const eventType = data.trigger === "insert" ? "ask.created" : "ask.updated";

      if (data.trigger === "update" && data.before) {
        for (const key in changedMapping) {
          const value = changedMapping[key as keyof typeof changedMapping];

          if (Array.isArray(value)) {
            const beforeArrayJSON = data.before[key as keyof OrderInfo] as string;
            const afterArrayJSON = data.after[key as keyof OrderInfo] as string;

            const beforeArray = JSON.parse(beforeArrayJSON.replace("infinity", "null"));
            const afterArray = JSON.parse(afterArrayJSON.replace("infinity", "null"));

            for (let i = 0; i < value.length; i++) {
              if (beforeArray[i] !== afterArray[i]) {
                changed.push(value[i]);
              }
            }
          } else if (data.before[key as keyof OrderInfo] !== data.after[key as keyof OrderInfo]) {
            changed.push(value);
          }
        }

        if (!changed.length) {
          try {
            for (const key in data.after) {
              const beforeValue = data.before[key as keyof OrderInfo];
              const afterValue = data.after[key as keyof OrderInfo];

              if (beforeValue !== afterValue) {
                changed.push(key as keyof OrderInfo);
              }
            }

            logger.info(
              this.queueName,
              JSON.stringify({
                message: `No changes detected for ask. orderId=${data.after.id}`,
                data,
                beforeJson: JSON.stringify(data.before),
                afterJson: JSON.stringify(data.after),
                changed,
                changedJson: JSON.stringify(changed),
                hasChanged: changed.length > 0,
              })
            );
          } catch (error) {
            logger.error(
              this.queueName,
              JSON.stringify({
                message: `No changes detected for ask error. orderId=${data.after.id}`,
                data,
                changed,
                error,
              })
            );
          }

          return;
        }
      }

      const criteriaBuildQuery = Orders.buildCriteriaQuery("orders", "token_set_id", true);

      const rawResult = await idb.oneOrNone(
        `
            SELECT
              (${criteriaBuildQuery}) AS criteria
            FROM orders
            WHERE orders.id = $/orderId/
          `,
        { orderId: data.after.id }
      );

      const sources = await Sources.getInstance();

      let source: SourcesEntity | undefined;

      if (data.after.token_set_id?.startsWith("token")) {
        const [, contract, tokenId] = data.after.token_set_id.split(":");
        source = sources.get(Number(data.after.source_id_int), contract, tokenId);
      } else {
        source = sources.get(Number(data.after.source_id_int));
      }

      const result = {
        id: data.after.id,
        kind: data.after.kind,
        side: data.after.side,
        status: formatStatus(data.after.fillability_status, data.after.approval_status),
        tokenSetId: data.after.token_set_id,
        tokenSetSchemaHash: data.after.token_set_schema_hash,
        nonce: data.after.nonce,
        contract: data.after.contract,
        maker: data.after.maker,
        taker: data.after.taker,
        price: await getJoiPriceObject(
          {
            gross: {
              amount: data.after.currency_price ?? data.after.price,
              nativeAmount: data.after.price,
            },
            net: {
              amount: getNetAmount(
                data.after.currency_price ?? data.after.price,
                _.min([data.after.fee_bps, 10000]) ?? data.after.fee_bps
              ),
              nativeAmount: getNetAmount(
                data.after.price,
                _.min([data.after.fee_bps, 10000]) ?? data.after.fee_bps
              ),
            },
          },
          data.after.currency
            ? data.after.currency
            : data.after.side === "sell"
            ? Sdk.Common.Addresses.Native[config.chainId]
            : Sdk.Common.Addresses.WNative[config.chainId],
          undefined
        ),
        ...formatValidBetween(data.after.valid_between),
        quantityFilled: Number(data.after.quantity_filled),
        quantityRemaining: Number(data.after.quantity_remaining),
        criteria: rawResult.criteria,
        source: getJoiSourceObject(source),
        feeBps: Number(data.after.fee_bps.toString()),
        feeBreakdown: data.after.fee_breakdown ? JSON.parse(data.after.fee_breakdown) : undefined,
        expiration: Math.floor(new Date(data.after.expiration).getTime() / 1000),
        isReservoir: data.after.is_reservoir,
        isDynamic: Boolean(data.after.dynamic || data.after.kind === "sudoswap"),
        createdAt: new Date(data.after.created_at).toISOString(),
        updatedAt: new Date(data.after.updated_at).toISOString(),
        originatedAt: data.after.originated_at
          ? new Date(data.after.originated_at).toISOString()
          : null,
        rawData: data.after.raw_data ? JSON.parse(data.after.raw_data) : undefined,
      };

      await publishWebsocketEvent({
        event: eventType,
        tags: {
          contract: data.after.contract,
          source: source?.domain || "unknown",
          maker: data.after.maker,
          taker: data.after.taker,
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
  fee_bps: number;

  fee_breakdown: string;
  expiration: string;
  is_reservoir: boolean | null;
  raw_data: string;
  created_at: string;
  originated_at: string;
  updated_at: string;
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
