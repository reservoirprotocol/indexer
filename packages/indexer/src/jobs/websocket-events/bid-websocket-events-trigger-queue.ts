import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";

import { randomUUID } from "crypto";
import _ from "lodash";
import * as Sdk from "@reservoir0x/sdk";

import { redb } from "@/common/db";
import { getJoiPriceObject } from "@/common/joi";
import { fromBuffer, getNetAmount } from "@/common/utils";
import { Sources } from "@/models/sources";
import { SourcesEntity } from "@/models/sources/sources-entity";
import { redisWebsocketPublisher } from "@/common/redis";
import { Orders } from "@/utils/orders";
import { TriggerKind } from "../order-updates/types";

const QUEUE_NAME = "bid-websocket-events-trigger-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: 1000,
    removeOnFail: 1000,
    timeout: 60000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork && config.doWebsocketServerWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { data } = job.data as EventInfo;

      const criteriaBuildQuery = Orders.buildCriteriaQuery("orders", "token_set_id", false);

      const rawResult = await redb.oneOrNone(
        `
            SELECT orders.id,
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
            DYNAMIC,
            DATE_PART('epoch', LOWER(orders.valid_between)) AS valid_from,
            COALESCE(NULLIF(DATE_PART('epoch', UPPER(orders.valid_between)), 'Infinity'), 0) AS valid_until,
            orders.source_id_int,
            orders.quantity_filled,
            orders.quantity_remaining,
            coalesce(orders.fee_bps, 0) AS fee_bps,
            orders.fee_breakdown,
            COALESCE(NULLIF(DATE_PART('epoch', orders.expiration), 'Infinity'), 0) AS expiration,
            orders.is_reservoir,
            orders.created_at,
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
        validUntil: Number(rawResult.valid_until),
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
        rawData: rawResult.raw_data,
      };

      const eventType = data.kind === "new-order" ? "bid.created" : "bid.updated";

      await redisWebsocketPublisher.publish(
        "events",
        JSON.stringify({
          event: eventType,
          tags: {
            contract: fromBuffer(rawResult.contract),
          },
          data: result,
        })
      );
    },
    { connection: redis.duplicate(), concurrency: 20 }
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
};
