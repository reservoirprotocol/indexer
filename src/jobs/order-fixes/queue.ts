import * as Sdk from "@reservoir0x/sdk";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { idb, redb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import * as orderUpdatesById from "@/jobs/order-updates/by-id-queue";

import * as looksRareCheck from "@/orderbook/orders/looks-rare/check";
import * as opendaoCheck from "@/orderbook/orders/opendao/check";
import * as seaportCheck from "@/orderbook/orders/seaport/check";
import * as wyvernV23Check from "@/orderbook/orders/wyvern-v2.3/check";
import * as x2y2Check from "@/orderbook/orders/x2y2/check";
import * as zeroExV4 from "@/orderbook/orders/zeroex-v4/check";

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
          case "id": {
            // If the order is valid, recheck is status.
            const result = await redb.oneOrNone(
              `
                SELECT
                  orders.kind,
                  orders.raw_data
                FROM orders
                WHERE orders.id = $/id/
                  AND orders.fillability_status = 'fillable'
                  AND orders.approval_status = 'approved'
              `,
              { id: data.id }
            );

            if (result) {
              let fillabilityStatus = "fillable";
              let approvalStatus = "approved";

              switch (result.kind) {
                case "looks-rare": {
                  const order = new Sdk.LooksRare.Order(config.chainId, result.raw_data);
                  try {
                    await looksRareCheck.offChainCheck(order, {
                      onChainApprovalRecheck: true,
                      checkFilledOrCancelled: true,
                    });
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  } catch (error: any) {
                    if (error.message === "cancelled") {
                      fillabilityStatus = "cancelled";
                    } else if (error.message === "filled") {
                      fillabilityStatus = "filled";
                    } else if (error.message === "no-balance") {
                      fillabilityStatus = "no-balance";
                    } else if (error.message === "no-approval") {
                      approvalStatus = "no-approval";
                    } else if (error.message === "no-balance-no-approval") {
                      fillabilityStatus = "no-balance";
                      approvalStatus = "no-approval";
                    }
                  }
                  break;
                }

                case "opendao-erc721":
                case "opendao-erc1155": {
                  const order = new Sdk.OpenDao.Order(config.chainId, result.raw_data);
                  try {
                    await opendaoCheck.offChainCheck(order, {
                      onChainApprovalRecheck: true,
                      checkFilledOrCancelled: true,
                    });
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  } catch (error: any) {
                    if (error.message === "cancelled") {
                      fillabilityStatus = "cancelled";
                    } else if (error.message === "filled") {
                      fillabilityStatus = "filled";
                    } else if (error.message === "no-balance") {
                      fillabilityStatus = "no-balance";
                    } else if (error.message === "no-approval") {
                      approvalStatus = "no-approval";
                    } else if (error.message === "no-balance-no-approval") {
                      fillabilityStatus = "no-balance";
                      approvalStatus = "no-approval";
                    }
                  }
                  break;
                }

                case "wyvern-v2.3": {
                  const order = new Sdk.WyvernV23.Order(config.chainId, result.raw_data);
                  try {
                    await wyvernV23Check.offChainCheck(order, {
                      onChainApprovalRecheck: true,
                      checkFilledOrCancelled: true,
                    });
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  } catch (error: any) {
                    if (error.message === "cancelled") {
                      fillabilityStatus = "cancelled";
                    } else if (error.message === "filled") {
                      fillabilityStatus = "filled";
                    } else if (error.message === "no-balance") {
                      fillabilityStatus = "no-balance";
                    } else if (error.message === "no-approval") {
                      approvalStatus = "no-approval";
                    } else if (error.message === "no-balance-no-approval") {
                      fillabilityStatus = "no-balance";
                      approvalStatus = "no-approval";
                    }
                  }

                  break;
                }

                case "x2y2": {
                  const order = new Sdk.X2Y2.Order(config.chainId, result.raw_data);
                  try {
                    await x2y2Check.offChainCheck(order, {
                      onChainApprovalRecheck: true,
                      checkFilledOrCancelled: true,
                    });
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  } catch (error: any) {
                    if (error.message === "cancelled") {
                      fillabilityStatus = "cancelled";
                    } else if (error.message === "filled") {
                      fillabilityStatus = "filled";
                    } else if (error.message === "no-balance") {
                      fillabilityStatus = "no-balance";
                    } else if (error.message === "no-approval") {
                      approvalStatus = "no-approval";
                    } else if (error.message === "no-balance-no-approval") {
                      fillabilityStatus = "no-balance";
                      approvalStatus = "no-approval";
                    }
                  }
                  break;
                }

                case "zeroex-v4-erc721":
                case "zeroex-v4-erc1155": {
                  const order = new Sdk.ZeroExV4.Order(config.chainId, result.raw_data);
                  try {
                    await zeroExV4.offChainCheck(order, {
                      onChainApprovalRecheck: true,
                      checkFilledOrCancelled: true,
                    });
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  } catch (error: any) {
                    if (error.message === "cancelled") {
                      fillabilityStatus = "cancelled";
                    } else if (error.message === "filled") {
                      fillabilityStatus = "filled";
                    } else if (error.message === "no-balance") {
                      fillabilityStatus = "no-balance";
                    } else if (error.message === "no-approval") {
                      approvalStatus = "no-approval";
                    } else if (error.message === "no-balance-no-approval") {
                      fillabilityStatus = "no-balance";
                      approvalStatus = "no-approval";
                    }
                  }
                  break;
                }

                case "seaport": {
                  const order = new Sdk.Seaport.Order(config.chainId, result.raw_data);
                  try {
                    await seaportCheck.offChainCheck(order, {
                      onChainApprovalRecheck: true,
                      checkFilledOrCancelled: true,
                    });
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  } catch (error: any) {
                    if (error.message === "cancelled") {
                      fillabilityStatus = "cancelled";
                    } else if (error.message === "filled") {
                      fillabilityStatus = "filled";
                    } else if (error.message === "no-balance") {
                      fillabilityStatus = "no-balance";
                    } else if (error.message === "no-approval") {
                      approvalStatus = "no-approval";
                    } else if (error.message === "no-balance-no-approval") {
                      fillabilityStatus = "no-balance";
                      approvalStatus = "no-approval";
                    }
                  }
                  break;
                }
              }

              const fixResult = await idb.oneOrNone(
                `
                  UPDATE "orders" AS "o" SET
                    "fillability_status" = $/fillabilityStatus/,
                    "approval_status" = $/approvalStatus/,
                    "updated_at" = now()
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
            }

            break;
          }

          case "token": {
            // Trigger a fix for all valid orders on the token.
            const result = await redb.manyOrNone(
              `
                SELECT "o"."id" FROM "orders" "o"
                WHERE "o"."token_set_id" = $/tokenSetId/
                  AND ("o"."fillability_status" = 'fillable' AND "o"."approval_status" = 'approved')
              `,
              { tokenSetId: `token:${data.token}` }
            );

            if (result) {
              await addToQueue(result.map(({ id }) => ({ by: "id", data: { id } })));
            }

            break;
          }

          case "maker": {
            // Trigger a fix for all of valid orders from the maker.
            // TODO: Use keyset pagination to be able to handle large amounts of orders.
            const result = await redb.manyOrNone(
              `
                SELECT "o"."id" FROM "orders" "o"
                WHERE "o"."maker" = $/maker/
                  AND "o"."fillability_status" = 'fillable'
                  AND "o"."approval_status" = 'approved'
              `,
              { maker: toBuffer(data.maker) }
            );

            if (result) {
              await addToQueue(result.map(({ id }) => ({ by: "id", data: { id } })));
            }

            break;
          }

          case "contract": {
            // Trigger a fix for all valid orders on the contract.
            for (const side of ["sell", "buy"]) {
              // TODO: Use keyset pagination to be able to handle large amounts of orders.
              const result = await redb.manyOrNone(
                `
                  SELECT "o"."id" FROM "orders" "o"
                  WHERE "o"."side" = $/side/ AND "o"."contract" = $/contract/
                    AND ("o"."fillability_status" = 'fillable' AND "o"."approval_status" = 'approved')
                `,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                { contract: toBuffer((data as any).contract), side }
              );

              if (result) {
                await addToQueue(result.map(({ id }) => ({ by: "id", data: { id } })));
              }
            }

            break;
          }
        }
      } catch (error) {
        logger.error(
          QUEUE_NAME,
          `Failed to handle order fix info ${JSON.stringify(job.data)}: ${error}`
        );
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 20 }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export type OrderFixInfo =
  | {
      by: "id";
      data: {
        id: string;
      };
    }
  | {
      by: "token";
      data: {
        token: string;
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
