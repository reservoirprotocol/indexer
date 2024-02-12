import _ from "lodash";
import cron from "node-cron";

import { idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { redlock } from "@/common/redis";
import { toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { BidEventsList } from "@/models/bid-events-list";

export class SaveBidEventsJob extends AbstractRabbitMqJobHandler {
  queueName = "save-bid-events-queue";
  maxRetries = 5;
  concurrency = 1;
  backoff = {
    type: "exponential",
    delay: 10000,
  } as BackoffStrategy;

  public async process() {
    const bidEventsList = new BidEventsList();
    let events = await bidEventsList.get(750);

    const columns = new pgp.helpers.ColumnSet(
      [
        "kind",
        "status",
        "contract",
        "token_set_id",
        "order_id",
        "order_source_id_int",
        "order_valid_between",
        "order_quantity_remaining",
        "order_nonce",
        "maker",
        "price",
        "value",
        "tx_hash",
        "tx_timestamp",
        "order_kind",
        "order_currency",
        "order_currency_price",
        "order_normalized_value",
        "order_currency_normalized_value",
        "order_raw_data",
      ],
      { table: "bid_events" }
    );

    events = events.filter((event) => {
      if (!event.trigger.kind) {
        logger.error(this.queueName, `no trigger kind for ${JSON.stringify(event)}`);
        return false;
      }

      return true;
    });

    const data = events.map((event) => {
      let status = "active";

      if (event.order.fillabilityStatus === "filled") {
        status = "filled";
      } else if (event.order.fillabilityStatus === "cancelled") {
        status = "cancelled";
      } else if (event.order.fillabilityStatus === "expired") {
        status = "expired";
      } else if (event.order.fillabilityStatus === "no-balance") {
        status = "inactive";
      } else if (event.order.approvalStatus === "no-approval") {
        status = "inactive";
      }

      return {
        kind: event.trigger.kind,
        status,
        contract: toBuffer(event.order.contract),
        token_set_id: event.order.tokenSetId,
        order_id: event.order.id,
        order_source_id_int: event.order.sourceIdInt,
        order_valid_between: event.order.validBetween,
        order_quantity_remaining: event.order.quantityRemaining,
        order_nonce: event.order.nonce,
        maker: toBuffer(event.order.maker),
        price: event.order.price,
        value: event.order.value,
        tx_hash: event.trigger.txHash ? toBuffer(event.trigger.txHash) : null,
        tx_timestamp: event.trigger.txTimestamp || null,
        order_kind: event.order.kind,
        order_currency: toBuffer(event.order.currency),
        order_currency_price: event.order.currency_price,
        order_normalized_value: event.order.normalized_value,
        order_currency_normalized_value: event.order.currency_normalized_value,
        order_raw_data: event.order.raw_data,
      };
    });

    if (!_.isEmpty(data)) {
      try {
        const query = pgp.helpers.insert(data, columns) + " ON CONFLICT DO NOTHING";
        await idb.none(query);
        await this.addToQueue();
      } catch (error) {
        logger.error(this.queueName, `failed to insert into bid_events ${error}`);
        await bidEventsList.add(events);
      }
    }
  }

  public async addToQueue() {
    await this.send();
  }
}

export const saveBidEventsJob = new SaveBidEventsJob();

if (config.doBackgroundWork) {
  cron.schedule(
    "*/10 * * * * *",
    async () =>
      await redlock
        .acquire(["save-bid-events"], (10 - 5) * 1000)
        .then(async () => saveBidEventsJob.addToQueue())
        .catch(() => {
          // Skip on any errors
        })
  );
}
