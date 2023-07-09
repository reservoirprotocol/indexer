import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { logger } from "@/common/logger";
import cron from "node-cron";
import { redis, redlock } from "@/common/redis";
import axios from "axios";
import { config } from "@/config/index";
import { idb, pgp } from "@/common/db";
import {
  orderUpdatesByIdJob,
  OrderUpdatesByIdJobPayload,
} from "@/jobs/order-updates/order-updates-by-id-job";

export class OrderUpdatesOracleOrderJob extends AbstractRabbitMqJobHandler {
  queueName = "oracle-orders";
  maxRetries = 1;
  concurrency = 1;
  singleActiveConsumer = true;
  useSharedChannel = true;
  backoff = {
    type: "exponential",
    delay: 10000,
  } as BackoffStrategy;
  intervalInSeconds = 5;

  protected async process() {
    logger.info(this.queueName, "Fetching oracle cancellations");

    // Fetch the cursor
    const CURSOR_KEY = "oracle-orders-cursor";
    const cursor = await redis.get(CURSOR_KEY).then((c) => c || "0");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const values: any[] = [];

    // Fetch any new cancellations
    const result = await axios
      .get(
        `https://seaport-oracle-${
          config.chainId === 1 ? "mainnet" : "goerli"
        }.up.railway.app/api/cancellations?fromTimestamp=${cursor}`
      )
      .then((response) => response.data);
    const cancellations = result.cancellations;
    for (const { orderHash } of cancellations) {
      values.push({ id: orderHash });
    }

    // Mark any relevant orders as cancelled
    const columns = new pgp.helpers.ColumnSet(["id"], {
      table: "orders",
    });
    if (values.length) {
      const updatedOrders = await idb.manyOrNone(
        `
            UPDATE orders SET
              fillability_status = 'cancelled',
              updated_at = now()
            FROM (VALUES ${pgp.helpers.values(values, columns)}) AS x(id)
            WHERE orders.id = x.id::TEXT
              AND orders.fillability_status != 'cancelled'
            RETURNING orders.id
          `
      );

      await orderUpdatesByIdJob.addToQueue(
        updatedOrders.map(
          ({ id }) =>
            ({
              context: `oracle-orders-check-${id}`,
              id,
              trigger: { kind: "cancel" },
            } as OrderUpdatesByIdJobPayload)
        )
      );
    }

    // Update the cursor
    if (cancellations.length) {
      const newCursor = cancellations[cancellations.length - 1].timestamp;
      await redis.set(CURSOR_KEY, newCursor);
    }
  }

  public async addToQueue() {
    await this.send();
  }
}

export const orderUpdatesOracleOrderJob = new OrderUpdatesOracleOrderJob();

if (config.doBackgroundWork) {
  cron.schedule(
    // Every 5 seconds
    "*/5 * * * * *",
    async () =>
      await redlock
        .acquire(["oracle-orders-check-lock"], (5 - 3) * 1000)
        .then(async () => {
          logger.info(orderUpdatesOracleOrderJob.queueName, "Triggering oracle orders check");
          await orderUpdatesOracleOrderJob.addToQueue();
        })
        .catch(() => {
          // Skip any errors
        })
  );
}
