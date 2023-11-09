import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { toBuffer } from "@/common/utils";
import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import {
  orderUpdatesByIdJob,
  OrderUpdatesByIdJobPayload,
} from "@/jobs/order-updates/order-updates-by-id-job";

export type OrderRevalidationsJobPayload =
  | {
      by: "id";
      data: {
        id: string;
        status: "active" | "inactive";
      };
    }
  | {
      by: "operator";
      data: {
        contract: string;
        blacklistedOperators?: string[];
        whitelistedOperators?: string[];
        createdAtContinutation?: string;
        status: "inactive";
      };
    };

export default class OrderRevalidationsJob extends AbstractRabbitMqJobHandler {
  queueName = "order-revalidations";
  maxRetries = 10;
  concurrency = 20;
  lazyMode = true;
  backoff = {
    type: "exponential",
    delay: 10000,
  } as BackoffStrategy;

  public async process(payload: OrderRevalidationsJobPayload) {
    const { by, data } = payload;

    try {
      switch (by) {
        case "id": {
          const { id, status } = data;

          await idb.none(
            `
              UPDATE orders SET
                fillability_status = '${status === "active" ? "fillable" : "cancelled"}',
                approval_status = '${status === "active" ? "approved" : "disabled"}',
                updated_at = now()
              WHERE orders.id = $/id/
            `,
            { id }
          );

          // Recheck the order
          await orderUpdatesByIdJob.addToQueue([
            {
              context: `revalidation-${Date.now()}-${id}`,
              id,
              trigger: {
                kind: "revalidation",
              },
            } as OrderUpdatesByIdJobPayload,
          ]);

          break;
        }

        case "operator": {
          const { contract, blacklistedOperators, whitelistedOperators, createdAtContinutation } =
            data;

          // Process the same contract at most once per 5 minutes
          const lockKey = `order-revalidations:operator:${contract}:${createdAtContinutation}`;
          const lock = await redis.get(lockKey);
          if (lock) {
            return;
          }

          await redis.set(lockKey, "locked", "EX", 5 * 60);

          if (!blacklistedOperators && !whitelistedOperators) {
            return;
          }

          let done = true;

          const limit = 1000;
          for (const side of ["sell", "buy"]) {
            const results = await idb.manyOrNone(
              `
                WITH
                  x AS (
                    SELECT
                      orders.id,
                      orders.created_at
                    FROM orders
                    WHERE orders.contract = $/contract/
                      AND orders.side = $/side/
                      AND orders.fillability_status = 'fillable'
                      AND orders.approval_status = 'approved'
                      ${createdAtContinutation ? "AND orders.created_at < $/createdAt/" : ""}
                      ORDER BY orders.created_at DESC
                    LIMIT $/limit/
                  ),
                  y AS (
                    SELECT
                      x.created_at
                    FROM x
                    ORDER BY x.created_at DESC
                    LIMIT 1
                  )
                UPDATE orders SET
                  fillability_status = 'cancelled',
                  approval_status = 'disabled',
                  updated_at = now()
                FROM x
                WHERE orders.id = x.id
                  ${
                    blacklistedOperators
                      ? "AND orders.conduit = ANY(ARRAY[$/blacklistedOperators:list/]::BYTEA[])"
                      : ""
                  }
                  ${
                    whitelistedOperators
                      ? "AND orders.conduit <> ALL(ARRAY[$/whitelistedOperators:list/]::BYTEA[])"
                      : ""
                  }
                RETURNING
                  x.id,
                  (SELECT y.created_at FROM y) AS created_at
              `,
              {
                contract: toBuffer(contract),
                side,
                limit,
                blacklistedOperators: blacklistedOperators?.map((o) => toBuffer(o)),
                whitelistedOperators: whitelistedOperators?.map((o) => toBuffer(o)),
                createdAt: createdAtContinutation,
              }
            );

            logger.info(
              this.queueName,
              `Results: ${JSON.stringify({
                contract,
                results,
                data,
                blacklistedOperators,
                whitelistedOperators,
                createdAtContinutation,
              })}`
            );

            // Recheck the orders
            await orderUpdatesByIdJob.addToQueue(
              results.map(
                (r) =>
                  ({
                    context: `revalidation-${Date.now()}-${r.id}`,
                    id: r.id,
                    trigger: {
                      kind: "revalidation",
                    },
                  } as OrderUpdatesByIdJobPayload)
              )
            );

            if (results.length >= 1) {
              done = false;
              payload.data.createdAtContinutation = results[0].created_at;
            }
          }

          if (!done) {
            await this.addToQueue([payload]);
          }

          break;
        }
      }
    } catch (error) {
      logger.error(
        this.queueName,
        `Failed to handle order revalidation info ${JSON.stringify(payload)}: ${error}`
      );
      throw error;
    }
  }

  public async addToQueue(orderRevalidationInfos: OrderRevalidationsJobPayload[]) {
    await this.sendBatch(orderRevalidationInfos.map((info) => ({ payload: info })));
  }
}

export const orderRevalidationsJob = new OrderRevalidationsJob();
