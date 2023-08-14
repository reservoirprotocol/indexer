import { AddressZero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import { keccak256 } from "@ethersproject/solidity";
import * as Sdk from "@reservoir0x/sdk";
import pLimit from "p-limit";
import _ from "lodash";

import { idb, pgp, redb } from "@/common/db";
import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import {
  orderUpdatesByIdJob,
  OrderUpdatesByIdJobPayload,
} from "@/jobs/order-updates/order-updates-by-id-job";
import { Sources } from "@/models/sources";
import { DbOrder, OrderMetadata, generateSchemaHash } from "@/orderbook/orders/utils";
import * as tokenSet from "@/orderbook/token-sets";
import * as midaswap from "@/utils/midaswap";

import PairAbi from "@reservoir0x/sdk/dist/midaswap/abis/Pair.json";

type Price = {
  price: string;
  bin: number;
  lpTokenId: string;
};

export type OrderInfo = {
  orderParams: {
    pool: string;
    lpTokenId?: string;
    nftId?: string;
    binLower?: number;
    binstep?: number;
    binAmount?: number;
    tradeBin?: number;
    orderId?: string;
    // Validation parameters (for ensuring only the latest event is relevant)
    txHash: string;
    txTimestamp: number;
    txBlock: number;
    logIndex: number;
    // Misc options
    forceRecheck?: boolean;
  };
  metadata: OrderMetadata;
};

type SaveResult = {
  id: string;
  txHash: string;
  txTimestamp: number;
  status: string;
  triggerKind?: "new-order" | "reprice";
};

export const getOrderId = (pool: string, lpTokenId: string, tokenId?: string) =>
  tokenId
    ? keccak256(
        ["string", "address", "string", "string", "string"],
        ["midaswap", pool, "sell", lpTokenId, tokenId]
      )
    : keccak256(["string", "address", "string", "string"], ["midaswap", pool, "buy", lpTokenId]);

export const save = async (orderInfos: OrderInfo[]): Promise<SaveResult[]> => {
  const results: SaveResult[] = [];
  const orderValues: DbOrder[] = [];

  const handleOrder = async ({ orderParams }: OrderInfo) => {
    try {
      const pool = await midaswap.getPoolDetails(orderParams.pool);

      if (!pool) {
        throw new Error("Could not fetch pool details");
      }

      if (pool.token !== Sdk.Common.Addresses.WNative[config.chainId]) {
        throw new Error("Unsupported currency");
      }

      const {
        binAmount,
        binLower,
        binstep,
        nftId,
        lpTokenId,
        tradeBin,
        orderId: sellOrderId,
      } = orderParams;

      const pairContract = new Contract(pool.address, PairAbi, baseProvider);
      const [, floorPriceBin] = await pairContract.getIDs();

      if (!lpTokenId) {
        return;
      }

      // Handle: fees
      const feeBps = pool.freeRateBps;
      const feeBreakdown: {
        kind: string;
        recipient: string;
        bps: number;
      }[] = [
        {
          kind: "marketplace",
          recipient: pool.address,
          bps: pool.freeRateBps,
        },
      ];

      // Create buy/sell orders
      const createOrder = async (prices: Price[], tokenId?: string) => {
        if (!prices.length) {
          return;
        }

        const id = getOrderId(orderParams.pool, lpTokenId, tokenId);

        // Handle: token set
        const schemaHash = generateSchemaHash();
        const [{ id: tokenSetId }] = tokenId
          ? await tokenSet.singleToken.save([
              {
                id: `token:${pool.nft}:${tokenId}`.toLowerCase(),
                schemaHash,
                contract: pool.nft,
                tokenId,
              },
            ])
          : await tokenSet.contractWide.save([
              {
                id: `contract:${pool.nft}`.toLowerCase(),
                schemaHash,
                contract: pool.nft,
              },
            ]);

        if (!tokenSetId) {
          throw new Error("No token set available");
        }

        const price = prices[0].price;
        const value = price;

        // Handle: core sdk order
        const sdkOrder: Sdk.Midaswap.Order = new Sdk.Midaswap.Order(config.chainId, {
          pair: pool.address,
          tokenX: pool.nft,
          tokenY: pool.token,
          tokenId,
          lpTokenId,
          pool: `${orderParams.pool}_${lpTokenId}`,
          extra: {
            prices: prices.map((p) => p.price),
            bins: prices.map((p) => p.bin),
            lpTokenIds: prices.map((p) => p.lpTokenId),
            floorPrice: tokenId
              ? undefined
              : // Only buy orders need this field
                Sdk.Midaswap.Order.getBuyPrice(floorPriceBin, pool.freeRateBps, pool.royaltyBps),
          },
        });

        // Handle: source
        const sources = await Sources.getInstance();
        const source = await sources.getOrInsert("midaswap.org");

        const validFrom = `date_trunc('seconds', to_timestamp(${orderParams.txTimestamp}))`;
        const validTo = `'Infinity'`;

        orderValues.push({
          id,
          kind: "midaswap",
          side: tokenId ? "sell" : "buy",
          fillability_status: "fillable",
          approval_status: "approved",
          token_set_id: tokenSetId,
          token_set_schema_hash: toBuffer(schemaHash),
          maker: toBuffer(pool.address),
          taker: toBuffer(AddressZero),
          price: price.toString(),
          value: value.toString(),
          currency: toBuffer(pool.token),
          currency_price: price.toString(),
          currency_value: value.toString(),
          needs_conversion: null,
          quantity_remaining: "1",
          valid_between: `tstzrange(${validFrom}, ${validTo}, '[]')`,
          nonce: null,
          source_id_int: source?.id,
          is_reservoir: null,
          contract: toBuffer(pool.nft),
          conduit: null,
          fee_bps: feeBps,
          fee_breakdown: feeBreakdown,
          dynamic: null,
          raw_data: sdkOrder.params,
          expiration: validTo,
          missing_royalties: null,
          normalized_value: null,
          currency_normalized_value: null,
          block_number: orderParams.txBlock ?? null,
          log_index: orderParams.logIndex ?? null,
        });

        results.push({
          id,
          txHash: orderParams.txHash,
          txTimestamp: orderParams.txTimestamp,
          status: "success",
          triggerKind: "new-order",
        });
      };

      const repriceOrder = async (id: string, order: Sdk.Midaswap.Order) => {
        await idb.none(
          `
            UPDATE orders SET
              fillability_status = 'fillable',
              approval_status = 'approved',
              price = $/price/,
              currency_price = $/price/,
              value = $/value/,
              currency_value = $/value/,
              valid_between = tstzrange(date_trunc('seconds', to_timestamp(${orderParams.txTimestamp})), 'Infinity', '[]'),
              updated_at = now(),
              raw_data = $/rawData:json/,
              log_index = $/logIndex/
            WHERE orders.id = $/id/
          `,
          {
            id,
            price: order.params.extra.prices[0],
            value: order.params.extra.prices[0],
            rawData: order.params,
            quantityRemaining: order.params.extra.prices.length.toString(),
            blockNumber: orderParams.txBlock,
            logIndex: orderParams.logIndex,
          }
        );

        results.push({
          id,
          txHash: orderParams.txHash,
          txTimestamp: orderParams.txTimestamp,
          status: "success",
          triggerKind: "reprice",
        });
      };

      if (tradeBin) {
        if (sellOrderId) {
          // Buy from pool

          // Handle sell orders
          const sellOrders = await redb.manyOrNone(
            `
              SELECT
                orders.id,
                orders.raw_data
              FROM orders
              WHERE orders.kind = 'midaswap'
                AND orders.side = 'sell'
                AND orders.fillability_status = 'fillable'
                AND orders.approval_status = 'approved'
                AND orders.contract IS NOT NULL
                AND orders.raw_data->>'lpTokenId' = $/lpTokenId/
            `,
            {
              lpTokenId: lpTokenId.toString(),
            }
          );

          const otherSellOrders = sellOrders.filter((order) => order.id !== sellOrderId);
          if (otherSellOrders.length) {
            const originalPrices: Price[] = otherSellOrders[0].raw_data.extra.prices.map(
              (price: string, index: number) => ({
                price,
                bin: +otherSellOrders[0].raw_data.extra.bins[index],
                lpTokenId,
              })
            );

            const found = originalPrices.find((item) => item.bin === tradeBin);
            const finalPrices = _.remove(originalPrices, (item) => item !== found);

            const order = new Sdk.Midaswap.Order(config.chainId, {
              pair: pool.address,
              tokenX: pool.nft,
              tokenY: pool.token,
              lpTokenId,
              pool: `${pool.address}_${lpTokenId}`,
              extra: {
                prices: finalPrices.map((p) => p.price),
                bins: finalPrices.map((p) => p.bin),
                lpTokenIds: finalPrices.map((p) => p.lpTokenId),
              },
            });
            otherSellOrders.forEach(async (item) => {
              await repriceOrder(item.id, order);
            });
          }

          // Handler buy orders
          const buyOrderId = getOrderId(pool.address, lpTokenId);
          const buyOrder = await redb.oneOrNone(
            `
              SELECT
                orders.id,
                orders.raw_data
              FROM orders
              WHERE orders.id = $/buyOrderId/
            `,
            { buyOrderId }
          );
          const newPrices: Price[] = [
            {
              bin: tradeBin,
              price: Sdk.Midaswap.Order.getBuyPrice(tradeBin, pool.freeRateBps, pool.royaltyBps),
              lpTokenId,
            },
          ];

          if (buyOrder) {
            const finalPrices: Price[] = _.sortBy(
              [
                ...newPrices,
                ...buyOrder.raw_data.extra.prices.map((item: string, index: number) => ({
                  price: item,
                  bin: +buyOrder.raw_data.extra.bins[index],
                  lpTokenId,
                })),
              ],
              "bin"
            ).reverse();

            const order = new Sdk.Midaswap.Order(config.chainId, {
              pair: pool.address,
              tokenX: pool.nft,
              tokenY: pool.token,
              lpTokenId,
              pool: `${pool.address}_${lpTokenId}`,
              extra: {
                prices: finalPrices.map((p) => p.price),
                bins: finalPrices.map((p) => p.bin),
                lpTokenIds: finalPrices.map((p) => p.lpTokenId),
                floorPrice: Sdk.Midaswap.Order.getBuyPrice(
                  floorPriceBin,
                  pool.freeRateBps,
                  pool.royaltyBps
                ),
              },
            });
            await repriceOrder(buyOrderId, order);
          } else {
            await createOrder(newPrices);
          }
        } else {
          // Sell to pool

          // Handler buy orders
          const buyOrderId = getOrderId(pool.address, lpTokenId);
          const buyOrder = await redb.oneOrNone(
            `
              SELECT
                orders.id,
                orders.raw_data
              FROM orders
              WHERE orders.id = $/buyOrderId/
            `,
            { buyOrderId }
          );
          if (buyOrder) {
            const originalPrices: Price[] = buyOrder.raw_data.extra.prices.map(
              (price: string, index: number) => ({
                price,
                bin: +buyOrder.raw_data.extra.bins[index],
                lpTokenId,
              })
            );

            const found = originalPrices.find((item) => item.bin === tradeBin);
            const finalPrices = _.remove(originalPrices, (item) => item !== found);

            const order = new Sdk.Midaswap.Order(config.chainId, {
              pair: pool.address,
              tokenX: pool.nft,
              tokenY: pool.token,
              lpTokenId,
              pool: `${pool.address}_${lpTokenId}`,
              extra: {
                prices: finalPrices.map((p) => p.price),
                bins: finalPrices.map((p) => p.bin),
                lpTokenIds: finalPrices.map((p) => p.lpTokenId),
                floorPrice: Sdk.Midaswap.Order.getBuyPrice(
                  floorPriceBin,
                  pool.freeRateBps,
                  pool.royaltyBps
                ),
              },
            });
            await repriceOrder(buyOrderId, order);
          }

          // Handler sell orders
          const sellOrderId = getOrderId(pool.address, lpTokenId, nftId);
          const sellOrders = await redb.manyOrNone(
            `
              SELECT
                orders.id,
                orders.raw_data
              FROM orders
              WHERE orders.kind = 'midaswap'
                AND orders.side = 'sell'
                AND orders.fillability_status = 'fillable'
                AND orders.approval_status = 'approved'
                AND orders.contract IS NOT NULL
                AND orders.raw_data->>'lpTokenId' = $/lpTokenId/
            `,
            {
              lpTokenId: lpTokenId.toString(),
            }
          );

          let finalPrices: Price[] = [
            {
              price: Sdk.Midaswap.Order.getSellPrice(tradeBin, pool.freeRateBps, pool.royaltyBps),
              bin: tradeBin,
              lpTokenId,
            },
          ];

          const otherSellOrders = sellOrders.filter((order) => order.id !== sellOrderId);
          if (otherSellOrders.length) {
            const originalPrices: Price[] = otherSellOrders[0].raw_data.extra.prices.map(
              (price: string, index: number) => ({
                price,
                bin: +otherSellOrders[0].raw_data.extra.bins[index],
                lpTokenId,
              })
            );
            finalPrices = _.sortBy([...originalPrices, ...finalPrices], "bin");
          }

          const order = new Sdk.Midaswap.Order(config.chainId, {
            pair: pool.address,
            tokenX: pool.nft,
            tokenY: pool.token,
            lpTokenId,
            pool: `${pool.address}_${lpTokenId}`,
            extra: {
              prices: finalPrices.map((p) => p.price),
              bins: finalPrices.map((p) => p.bin),
              lpTokenIds: finalPrices.map((p) => p.lpTokenId),
            },
          });
          otherSellOrders.forEach(async (item) => {
            await repriceOrder(item.id, order);
          });

          const sellOrder = sellOrders.find((item) => item.id === sellOrderId);
          if (sellOrder) {
            await repriceOrder(sellOrderId, order);
          } else {
            await createOrder(finalPrices, nftId);
          }
        }
      } else if (binAmount) {
        // Add NFT/FT liquidity

        if (binLower === undefined || binstep === undefined) {
          return;
        }

        const bins = nftId
          ? Array.from({ length: binAmount }).map((_, index) => binLower + index * binstep)
          : Array.from({ length: binAmount })
              .map((_, index) => binLower + index * binstep)
              .reverse();

        const prices: Price[] = bins.map((bin) => ({
          price: nftId
            ? Sdk.Midaswap.Order.getSellPrice(bin, pool.freeRateBps, pool.royaltyBps)
            : Sdk.Midaswap.Order.getBuyPrice(bin, pool.freeRateBps, pool.royaltyBps),
          bin,
          lpTokenId,
        }));

        await createOrder(prices, nftId);
      }
    } catch (error) {
      logger.error(
        "orders-midaswap-save",
        `Failed to handle order with params ${JSON.stringify(orderParams)}: ${error}`
      );
    }
  };

  // Process all orders concurrently
  const limit = pLimit(20);
  await Promise.all(orderInfos.map((orderInfo) => limit(() => handleOrder(orderInfo))));

  if (orderValues.length) {
    const columns = new pgp.helpers.ColumnSet(
      [
        "id",
        "kind",
        "side",
        "fillability_status",
        "approval_status",
        "token_set_id",
        "token_set_schema_hash",
        "maker",
        "taker",
        "price",
        "value",
        "currency",
        "currency_price",
        "currency_value",
        "needs_conversion",
        "quantity_remaining",
        { name: "valid_between", mod: ":raw" },
        "nonce",
        "source_id_int",
        "is_reservoir",
        "contract",
        "fee_bps",
        { name: "fee_breakdown", mod: ":json" },
        "dynamic",
        "raw_data",
        { name: "expiration", mod: ":raw" },
        { name: "missing_royalties", mod: ":json" },
        "normalized_value",
        "currency_normalized_value",
        "block_number",
        "log_index",
      ],
      {
        table: "orders",
      }
    );
    try {
      await idb.none(pgp.helpers.insert(orderValues, columns) + " ON CONFLICT DO NOTHING");
    } catch (error) {
      logger.error(
        "orders-midaswap-save",
        `Failed to handle order with params ${JSON.stringify(error)}: ${error}`
      );
    }
  }

  await orderUpdatesByIdJob.addToQueue(
    results
      .filter(({ status }) => status === "success")
      .map(
        ({ id, txHash, txTimestamp, triggerKind }) =>
          ({
            context: `${triggerKind}-${id}-${txHash}`,
            id,
            trigger: {
              kind: triggerKind,
              txHash: txHash,
              txTimestamp: txTimestamp,
            },
          } as OrderUpdatesByIdJobPayload)
      )
  );

  return results;
};
