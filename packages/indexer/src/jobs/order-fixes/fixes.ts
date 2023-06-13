import { Interface } from "@ethersproject/abi";
import { BigNumber } from "@ethersproject/bignumber";
import { HashZero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import * as Sdk from "@reservoir0x/sdk";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { redis } from "@/common/redis";
import { now, toBuffer } from "@/common/utils";
import { config } from "@/config/index";

import * as orderUpdatesById from "@/jobs/order-updates/by-id-queue";
import * as orderbook from "@/jobs/orderbook/orders-queue";

import * as commonHelpers from "@/orderbook/orders/common/helpers";
import * as raribleCheck from "@/orderbook/orders/rarible/check";
import * as seaportCheck from "@/orderbook/orders/seaport-base/check";
import * as x2y2Check from "@/orderbook/orders/x2y2/check";
import * as zeroExV4Check from "@/orderbook/orders/zeroex-v4/check";
import * as blurCheck from "@/orderbook/orders/blur/check";
import * as nftxCheck from "@/orderbook/orders/nftx/check";
import * as looksRareV2Check from "@/orderbook/orders/looks-rare-v2/check";

const QUEUE_NAME = "order-fixes";

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
            // If the order is valid or potentially valid, recheck it's status
            const result = await idb.oneOrNone(
              `
                SELECT
                  orders.id,
                  orders.side,
                  orders.token_set_id,
                  orders.kind,
                  orders.quantity_remaining,
                  orders.raw_data,
                  orders.block_number,
                  orders.log_index,
                  orders.originated_at
                FROM orders
                WHERE orders.id = $/id/
                  AND (orders.fillability_status = 'fillable' OR orders.fillability_status = 'no-balance')
                  AND (orders.approval_status = 'approved' OR orders.approval_status = 'no-approval')
              `,
              { id: data.id }
            );

            if (result && result.raw_data) {
              let fillabilityStatus = "fillable";
              let approvalStatus = "approved";

              switch (result.kind) {
                case "blur": {
                  if (result.side === "sell" && !result.raw_data.createdAt) {
                    const order = new Sdk.Blur.Order(config.chainId, result.raw_data);
                    try {
                      await blurCheck.offChainCheck(order, result.originated_at, {
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
                      } else {
                        return;
                      }
                    }
                  }
                  break;
                }

                case "looks-rare-v2": {
                  const order = new Sdk.LooksRareV2.Order(config.chainId, result.raw_data);
                  try {
                    await looksRareV2Check.offChainCheck(order, {
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
                    } else {
                      return;
                    }
                  }
                  break;
                }

                case "x2y2": {
                  const order = new Sdk.X2Y2.Order(config.chainId, result.raw_data);
                  try {
                    await x2y2Check.offChainCheck(order, result.originated_at, {
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
                    } else {
                      return;
                    }
                  }
                  break;
                }

                case "zeroex-v4-erc721":
                case "zeroex-v4-erc1155": {
                  const order = new Sdk.ZeroExV4.Order(config.chainId, result.raw_data);
                  try {
                    await zeroExV4Check.offChainCheck(order, {
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
                    } else {
                      return;
                    }
                  }
                  break;
                }

                case "seaport": {
                  const order = new Sdk.SeaportV11.Order(config.chainId, result.raw_data);
                  const exchange = new Sdk.SeaportV11.Exchange(config.chainId);
                  try {
                    await seaportCheck.offChainCheck(order, "seaport", exchange, {
                      onChainApprovalRecheck: true,
                      checkFilledOrCancelled: true,
                      quantityRemaining: result.quantity_remaining,
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
                    } else {
                      return;
                    }
                  }
                  break;
                }

                case "seaport-v1.4": {
                  const order = new Sdk.SeaportV14.Order(config.chainId, result.raw_data);
                  const exchange = new Sdk.SeaportV14.Exchange(config.chainId);
                  try {
                    await seaportCheck.offChainCheck(order, "seaport-v1.4", exchange, {
                      onChainApprovalRecheck: true,
                      checkFilledOrCancelled: true,
                      quantityRemaining: result.quantity_remaining,
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
                    } else {
                      return;
                    }
                  }
                  break;
                }

                case "seaport-v1.5": {
                  const order = new Sdk.SeaportV15.Order(config.chainId, result.raw_data);
                  const exchange = new Sdk.SeaportV15.Exchange(config.chainId);
                  try {
                    await seaportCheck.offChainCheck(order, "seaport-v1.5", exchange, {
                      onChainApprovalRecheck: true,
                      checkFilledOrCancelled: true,
                      quantityRemaining: result.quantity_remaining,
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
                    } else {
                      return;
                    }
                  }
                  break;
                }

                case "nftx": {
                  try {
                    await nftxCheck.offChainCheck(result.id);

                    // Fully refresh the order at most once per hour
                    const order = new Sdk.Nftx.Order(config.chainId, result.raw_data);
                    const cacheKey = `order-fixes:nftx:${order.params.pool}`;
                    if (!redis.get(cacheKey)) {
                      await redis.set(cacheKey, "locked", "EX", 3600);
                      await orderbook.addToQueue([
                        {
                          kind: "nftx",
                          info: {
                            orderParams: {
                              pool: order.params.pool,
                              txHash: HashZero,
                              txTimestamp: now(),
                              txBlock: result.block_number,
                              logIndex: result.log_index,
                              forceRecheck: true,
                            },
                            metadata: {},
                          },
                        },
                      ]);
                    }

                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  } catch (error: any) {
                    if (error.message === "no-balance") {
                      fillabilityStatus = "no-balance";
                    } else {
                      return;
                    }
                  }
                  break;
                }

                case "sudoswap": {
                  try {
                    const order = new Sdk.Sudoswap.Order(config.chainId, result.raw_data);
                    const cacheKey = `order-fixes:sudoswap:${order.params.pair}`;
                    if (!redis.get(cacheKey)) {
                      await redis.set(cacheKey, "locked", "EX", 3600);
                      await orderbook.addToQueue([
                        {
                          kind: "sudoswap",
                          info: {
                            orderParams: {
                              pool: order.params.pair,
                              txHash: HashZero,
                              txTimestamp: now(),
                              txBlock: result.block_number,
                              logIndex: result.log_index,
                              forceRecheck: true,
                            },
                            metadata: {},
                          },
                        },
                      ]);
                    }

                    // TODO: Add support for bid validation
                    if (result.side === "sell") {
                      const [, contract, tokenId] = result.token_set_id.split(":");
                      const balance = await commonHelpers.getNftBalance(
                        contract,
                        tokenId,
                        order.params.pair
                      );
                      if (balance.lte(0)) {
                        fillabilityStatus = "no-balance";
                      }
                    }
                  } catch {
                    return;
                  }

                  break;
                }

                case "sudoswap-v2": {
                  try {
                    const order = new Sdk.SudoswapV2.Order(config.chainId, result.raw_data);
                    const cacheKey = `order-fixes:sudoswap-v2:${order.params.pair}`;
                    if (!redis.get(cacheKey)) {
                      await redis.set(cacheKey, "locked", "EX", 3600);
                      await orderbook.addToQueue([
                        {
                          kind: "sudoswap-v2",
                          info: {
                            orderParams: {
                              pool: order.params.pair,
                              txHash: HashZero,
                              txTimestamp: now(),
                              txBlock: result.block_number,
                              logIndex: result.log_index,
                              forceRecheck: true,
                            },
                            metadata: {},
                          },
                        },
                      ]);
                    }

                    // TODO: Add support for bid validation
                    if (result.side === "sell") {
                      const [, contract, tokenId] = result.token_set_id.split(":");
                      const balance = await commonHelpers.getNftBalance(
                        contract,
                        tokenId,
                        order.params.pair
                      );
                      if (balance.lte(0)) {
                        fillabilityStatus = "no-balance";
                      }
                    }
                  } catch {
                    return;
                  }

                  break;
                }

                case "collectionxyz": {
                  try {
                    if (result.side === "sell") {
                      const [, , tokenId] = result.token_set_id.split(":");

                      // It's not sufficient to check ownership - the pool must recognize ownership of the token
                      const poolContract = new Contract(
                        result.raw_data.pool,
                        new Interface([`function getAllHeldIds() view returns (uint256[])`]),
                        baseProvider
                      );

                      let isLegit = false;

                      const legitIds = await poolContract.getAllHeldIds();
                      legitIds.forEach((legitId: BigNumber) => {
                        if (legitId.toString() === tokenId) {
                          isLegit = true;
                        }
                      });

                      if (!isLegit) {
                        fillabilityStatus = "no-balance";
                      }
                    }
                  } catch {
                    return;
                  }

                  break;
                }

                case "rarible": {
                  const order = new Sdk.Rarible.Order(config.chainId, result.raw_data);
                  try {
                    await raribleCheck.offChainCheck(order, {
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
                    } else {
                      return;
                    }
                  }
                  break;
                }
              }

              const fixResult = await idb.oneOrNone(
                `
                  UPDATE orders SET
                    fillability_status = $/fillabilityStatus/,
                    approval_status = $/approvalStatus/,
                    expiration = (
                      CASE
                        WHEN $/fillabilityStatus/ = 'fillable' AND $/approvalStatus/ = 'approved' THEN nullif(upper(orders.valid_between), 'infinity')
                        ELSE now()
                      END
                    ),
                    updated_at = now()
                  WHERE orders.id = $/id/
                    AND (orders.fillability_status != $/fillabilityStatus/ OR orders.approval_status != $/approvalStatus/)
                  RETURNING orders.id
                `,
                {
                  id: data.id,
                  fillabilityStatus,
                  approvalStatus,
                }
              );

              if (fixResult) {
                // Update any wrong caches
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
            // Trigger a fix for all valid orders on the token
            const result = await idb.manyOrNone(
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
            // Trigger a fix for all of valid orders from the maker
            // TODO: Use keyset pagination to be able to handle large amounts of orders
            const result = await idb.manyOrNone(
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
            // Trigger a fix for all valid orders on the contract
            for (const side of ["sell", "buy"]) {
              // TODO: Use keyset pagination to be able to handle large amounts of orders
              const result = await idb.manyOrNone(
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
