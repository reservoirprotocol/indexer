import * as Sdk from "@reservoir0x/sdk";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";
import _ from "lodash";

import { idb } from "@/common/db";
import { getJoiPriceObject } from "@/common/joi";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { fromBuffer, getNetAmount } from "@/common/utils";
import { publishWebsocketEvent } from "@/common/websocketPublisher";
import { config } from "@/config/index";
import { TriggerKind } from "@/jobs/order-updates/types";
import { Sources } from "@/models/sources";
import { SourcesEntity } from "@/models/sources/sources-entity";
import { Orders } from "@/utils/orders";

const QUEUE_NAME = "bid-websocket-events-trigger-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
    removeOnComplete: 1000,
    removeOnFail: 1000,
    timeout: 60000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork && config.doWebsocketServerWork && config.kafkaBrokers.length > 0) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { data } = job.data as EventInfo;

      try {
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
          { orderId: data.orderId }
        );

        const sources = await Sources.getInstance();

        const feeBreakdown = rawResult.fee_breakdown;
        const feeBps = rawResult?.fee_bps;

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
          nonce: Number(rawResult.nonce),
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
              ? Sdk.Common.Addresses.Eth[config.chainId]
              : Sdk.Common.Addresses.Weth[config.chainId],
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
          feeBps: Number(feeBps?.toString()) || 0,
          feeBreakdown: feeBreakdown,
          expiration: Number(rawResult.expiration),
          isReservoir: rawResult.is_reservoir,
          isDynamic: Boolean(rawResult.dynamic || rawResult.kind === "sudoswap"),
          createdAt: new Date(rawResult.created_at).toISOString(),
          updatedAt: new Date(rawResult.updated_at).toISOString(),
          rawData: rawResult.raw_data,
        };

        let eventType;
        if (config.doOldOrderWebsocketWork) {
          eventType = data.kind === "new-order" ? "bid.created" : "bid.updated";
        } else {
          eventType = data.trigger === "insert" ? "bid.created" : "bid.updated";
        }

        await publishWebsocketEvent({
          event: eventType,
          tags: {
            contract: fromBuffer(rawResult.contract),
            source: result.source.domain || "unknown",
            maker: fromBuffer(rawResult.maker),
            taker: fromBuffer(rawResult.taker),
          },
          data: result,
          offset: data.offset,
        });
      } catch (error) {
        logger.error(
          QUEUE_NAME,
          `Error processing websocket event. data=${JSON.stringify(data)}, error=${JSON.stringify(
            error
          )}`
        );
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 80 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored. error=${JSON.stringify(error)}`);
  });
}

export type EventInfo = {
  data: BidWebsocketEventInfo;
};

export const addToQueue = async (events: EventInfo[]) => {
  if (!config.doWebsocketServerWork) {
    return;
  }

  await queue.addBulk(
    _.map(events, (event) => ({
      name: randomUUID(),
      data: event,
    }))
  );
};

export type BidWebsocketEventInfo = {
  orderId: string;
  kind: TriggerKind;
  trigger: "insert" | "update";
  offset: string;
};
