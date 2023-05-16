import { Queue, QueueScheduler, Worker } from "bullmq";

import cron from "node-cron";
import { logger } from "@/common/logger";
import { redis, redlock } from "@/common/redis";
import { config } from "@/config/index";
import { randomUUID } from "crypto";
import { BidEventsList } from "@/models/bid-events-list";
import { idb } from "@/common/db";
import { toBuffer } from "@/common/utils";
import _ from "lodash";

const QUEUE_NAME = "save-bid-events-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 10000,
    },
    removeOnComplete: 1000,
    removeOnFail: 10000,
    timeout: 30000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const bidEventsList = new BidEventsList();
      const events = await bidEventsList.get(750);
      const values = [];
      let replacements = {};

      let i = 0;
      for (const event of events) {
        values.push(`(
            $/kind${i}/,
            (
              CASE
                WHEN $/fillabilityStatus${i}/ = 'filled' THEN 'filled'
                WHEN $/fillabilityStatus${i}/ = 'cancelled' THEN 'cancelled'
                WHEN $/fillabilityStatus${i}/ = 'expired' THEN 'expired'
                WHEN $/fillabilityStatus${i}/ = 'no-balance' THEN 'inactive'
                WHEN $/approvalStatus${i}/ = 'no-approval' THEN 'inactive'
                ELSE 'active'
              END
            )::order_event_status_t,
            $/contract${i}/,
            $/tokenSetId${i}/,
            $/orderId${i}/,
            $/orderSourceIdInt${i}/,
            $/validBetween${i}/,
            $/quantityRemaining${i}/,
            $/nonce${i}/,
            $/maker${i}/,
            $/price${i}/,
            $/value${i}/,
            $/txHash${i}/,
            $/txTimestamp${i}/,
            $/orderKind${i}/,
            $/orderCurrency${i}/,
            $/orderCurrencyPrice${i}/,
            $/orderNormalizedValue${i}/,
            $/orderCurrencyNormalizedValue${i}/,
            $/orderRawData${i}/
          )
        `);

        replacements = _.merge(replacements, {
          [`fillabilityStatus${i}`]: event.order.fillabilityStatus,
          [`approvalStatus${i}`]: event.order.approvalStatus,
          [`contract${i}`]: toBuffer(event.order.contract),
          [`tokenSetId${i}`]: event.order.tokenSetId,
          [`orderId${i}`]: event.order.id,
          [`orderSourceIdInt${i}`]: event.order.sourceIdInt,
          [`validBetween${i}`]: event.order.validBetween,
          [`quantityRemaining${i}`]: event.order.quantityRemaining,
          [`nonce${i}`]: event.order.nonce,
          [`maker${i}`]: toBuffer(event.order.maker),
          [`price${i}`]: event.order.price,
          [`value${i}`]: event.order.value,
          [`kind${i}`]: event.trigger.kind,
          [`txHash${i}`]: event.trigger.txHash ? toBuffer(event.trigger.txHash) : null,
          [`txTimestamp${i}`]: event.trigger.txTimestamp || null,
          [`orderKind${i}`]: event.order.kind,
          [`orderCurrency${i}`]: toBuffer(event.order.currency),
          [`orderCurrencyPrice${i}`]: event.order.currency_price,
          [`orderNormalizedValue${i}`]: event.order.normalized_value,
          [`orderCurrencyNormalizedValue${i}`]: event.order.currency_normalized_value,
          [`orderRawData${i}`]: event.order.raw_data,
        });

        ++i;
      }

      if (!_.isEmpty(values)) {
        try {
          await idb.none(
            `
            INSERT INTO bid_events (
              kind,
              status,
              contract,
              token_set_id,
              order_id,
              order_source_id_int,
              order_valid_between,
              order_quantity_remaining,
              order_nonce,
              maker,
              price,
              value,
              tx_hash,
              tx_timestamp,
              order_kind,
              order_currency,
              order_currency_price,
              order_normalized_value,
              order_currency_normalized_value,
              order_raw_data
            )
            VALUES ${_.join(values, ",")}
          `,
            replacements
          );
        } catch (error) {
          logger.error(QUEUE_NAME, `failed to insert into bid_events ${error}`);
          await bidEventsList.add(events);
        }

        job.data.checkForMore = true;
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });

  worker.on("completed", async (job) => {
    if (job.data.checkForMore) {
      await addToQueue();
    }
  });
}

export const addToQueue = async () => {
  await queue.add(randomUUID(), {});
};

if (config.doBackgroundWork) {
  cron.schedule(
    "*/10 * * * * *",
    async () =>
      await redlock
        .acquire(["save-bid-events"], (10 - 5) * 1000)
        .then(async () => addToQueue())
        .catch(() => {
          // Skip on any errors
        })
  );
}
