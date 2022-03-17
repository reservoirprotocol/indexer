import { AddressZero, HashZero } from "@ethersproject/constants";
import * as Sdk from "@reservoir0x/sdk";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { fromBuffer, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import * as orderUpdatesById from "@/jobs/order-updates/by-id-queue";
import * as wyvernV23Check from "@/orderbook/orders/wyvern-v2.3/check";

const QUEUE_NAME = "order-fixes";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 10000,
    },
    removeOnComplete: 10000,
    removeOnFail: 10000,
    timeout: 60000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { by, data } = job.data as OrderFixInfo;

      try {
        switch (by) {
          case "all": {
            // WARNING! This is a very slow process! Use keyset pagination on
            // `maker_id` to iterate through all potentially valid orders (eg.
            // 'fillable' or 'no-balance').

            const { kind, continuation } = data;

            if (kind === "sell-balance") {
              let makerContinuation = toBuffer(AddressZero);
              let idContinuation = HashZero;
              if (continuation) {
                const [maker, id] = continuation.split("_");
                makerContinuation = toBuffer(maker);
                idContinuation = id;
              }

              const limit = 1000;
              const result = await idb.oneOrNone(
                `
                  WITH "x" AS (
                    SELECT
                      "o"."id",
                      "o"."maker",
                      "o"."fillability_status",
                      (
                        CASE WHEN "nb"."amount" > 0
                          THEN 'fillable'
                          ELSE 'no-balance'
                        END
                      )::order_fillability_status_t AS "correct_fillability_status"
                    FROM "orders" "o"
                    JOIN "token_sets_tokens" "tst"
                      ON "o"."token_set_id" = "tst"."token_set_id"
                    LEFT JOIN "nft_balances" "nb"
                      ON "tst"."contract" = "nb"."contract"
                      AND "tst"."token_id" = "nb"."token_id"
                      AND "o"."maker" = "nb"."owner"
                    WHERE "o"."side" = 'sell'
                      AND ("o"."fillability_status" = 'fillable' OR "o"."fillability_status" = 'no-balance')
                      AND ("o"."maker", "o"."id") > ($/makerContinuation/, $/idContinuation/)
                    ORDER BY "o"."maker", "o"."id"
                    LIMIT ${limit}
                  ),
                  "y" AS (
                    UPDATE "orders" AS "o" SET
                      "fillability_status" = "x"."correct_fillability_status"
                    FROM "x"
                    WHERE "o"."fillability_status" != "x"."correct_fillability_status"
                      AND "o"."id" = "x"."id"
                    RETURNING "o"."id"
                  )
                  SELECT
                    (SELECT COUNT(*) FROM "x") AS "count",
                    (SELECT array_agg("y"."id") FROM "y") AS "order_ids",
                    "x"."maker",
                    "x"."id"
                  FROM "x"
                  ORDER BY "x"."maker" DESC, "x"."id" DESC
                  LIMIT 1
                `,
                {
                  makerContinuation,
                  idContinuation,
                }
              );

              if (result) {
                // Update any wrong caches.
                const orderIds: string[] = result.order_ids || [];
                await orderUpdatesById.addToQueue(
                  orderIds.map(
                    (id) =>
                      ({
                        context: `revalidation-${Date.now()}-${id}`,
                        id,
                        trigger: {
                          kind: "revalidation",
                        },
                      } as orderUpdatesById.OrderInfo)
                  )
                );

                // Trigger the next job if we still have orders to process.
                const count = Number(result.count);
                if (count === limit) {
                  const maker = fromBuffer(result.maker);
                  const id = result.id;
                  await addToQueue([
                    {
                      by: "all",
                      data: {
                        kind,
                        continuation: `${maker}_${id}`,
                      },
                    },
                  ]);
                }
              }
            }

            break;
          }

          case "id": {
            const result = await idb.oneOrNone(
              `
                SELECT "o"."kind", "o"."raw_data" FROM "orders" "o"
                WHERE "o"."id" = $/id/
              `,
              { id: data.id }
            );

            if (result) {
              switch (result.kind) {
                case "wyvern-v2.3": {
                  const order = new Sdk.WyvernV23.Order(
                    config.chainId,
                    result.raw_data
                  );

                  // Check whether the order is not fillable or not approved.
                  let fillabilityStatus = "fillable";
                  let approvalStatus = "approved";
                  try {
                    await wyvernV23Check.offChainCheck(order, {
                      onChainSellApprovalRecheck: true,
                    });
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  } catch (error: any) {
                    if (error.message === "no-balance") {
                      fillabilityStatus = "no-balance";
                    } else if (error.message === "no-approval") {
                      approvalStatus = "no-approval";
                    }
                  }

                  const fixResult = await idb.oneOrNone(
                    `
                      UPDATE "orders" AS "o" SET
                        "fillability_status" = $/fillabilityStatus/,
                        "approval_status" = $/approvalStatus/
                      WHERE "o"."id" = $/id/
                        AND ("o"."fillability_status" != $/fillabilityStatus/ OR "o"."approval_status" != $/approvalStatus/)
                      RETURNING "o"."id"
                    `,
                    {
                      id: data.id,
                      fillabilityStatus,
                      approvalStatus,
                    }
                  );

                  if (fixResult) {
                    // Update any wrong caches.
                    await orderUpdatesById.addToQueue([
                      {
                        context: `revalidation-${Date.now()}-${fixResult.id}`,
                        id: fixResult.id,
                        trigger: {
                          kind: "revalidation",
                        },
                      } as orderUpdatesById.OrderInfo,
                    ]);
                  }

                  break;
                }
              }
            }

            break;
          }

          case "maker": {
            // Trigger a fix for all of the maker's potentially valid orders.
            const result = await idb.manyOrNone(
              `
                SELECT "o"."id" FROM "orders" "o"
                WHERE "o"."maker" = $/maker/
                  AND ("o"."fillability_status" = 'fillable' OR "o"."fillability_status" = 'no-balance')
              `,
              { maker: toBuffer(data.maker) }
            );

            if (result) {
              await addToQueue(
                result.map(({ id }) => ({ by: "id", data: { id } }))
              );
            }

            break;
          }

          case "contract": {
            // Trigger a fix for all of the contract's potentially valid orders.
            // WARNING! In order to have this executed efficiently we should set
            // an additional index on the `orders` table (for now missing due to
            // maintenance overhead):
            // ```
            //   CREATE INDEX CONCURRENTLY "orders_token_set_id_index"
            //     ON "orders" ("token_set_id")
            //     WHERE ("fillability_status" = 'fillable' OR "fillability_status" = 'no-balance');
            // ```

            const result = await idb.manyOrNone(
              `
                SELECT "o"."id" FROM "orders" "o"
                JOIN "token_sets_tokens" "tst"
                  ON "o"."token_set_id" = "tst"."token_set_id"
                WHERE "tst"."contract" = $/contract/
                  AND ("o"."fillability_status" = 'fillable' OR "o"."fillability_status" = 'no-balance')
              `,
              { contract: toBuffer(data.contract) }
            );

            if (result) {
              await addToQueue(
                result.map(({ id }) => ({ by: "id", data: { id } }))
              );
            }

            break;
          }
        }
      } catch (error) {
        logger.error(
          QUEUE_NAME,
          `Failed to handle order fix info ${JSON.stringify(
            job.data
          )}: ${error}`
        );
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export type OrderFixInfo =
  | {
      by: "all";
      data: {
        kind: "sell-balance";
        continuation?: string;
      };
    }
  | {
      by: "id";
      data: {
        id: string;
      };
    }
  | {
      by: "maker";
      data: {
        maker: string;
      };
    }
  | {
      by: "contract";
      data: {
        contract: string;
      };
    };

export const addToQueue = async (orderFixInfos: OrderFixInfo[]) => {
  await queue.addBulk(
    orderFixInfos.map((orderFixInfo) => ({
      name: randomUUID(),
      data: orderFixInfo,
    }))
  );
};
