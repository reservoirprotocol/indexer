import { Interface } from "@ethersproject/abi";
import { AddressZero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import { keccak256 } from "@ethersproject/solidity";
import * as Sdk from "@reservoir0x/sdk";
import pLimit from "p-limit";

import { idb, pgp, redb } from "@/common/db";
import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { bn, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import * as ordersUpdateById from "@/jobs/order-updates/by-id-queue";
import { Sources } from "@/models/sources";
import { SudoswapPoolKind } from "@/models/sudoswap-pools";
import { DbOrder, OrderMetadata, generateSchemaHash } from "@/orderbook/orders/utils";
import * as tokenSet from "@/orderbook/token-sets";
import * as royalties from "@/utils/royalties";
import * as sudoswap from "@/utils/sudoswap";

export type OrderInfo = {
  orderParams: {
    pool: string;
    txTimestamp: number;
    txHash: string;
  };
  metadata: OrderMetadata;
};

type SaveResult = {
  id: string;
  txHash: string;
  status: string;
};

export const getOrderId = (pool: string, side: "sell" | "buy") =>
  keccak256(["string", "address", "string"], ["sudoswap", pool, side]);

export const save = async (orderInfos: OrderInfo[]): Promise<SaveResult[]> => {
  const results: SaveResult[] = [];
  const orderValues: DbOrder[] = [];

  const handleOrder = async ({ orderParams }: OrderInfo) => {
    try {
      const pool = await sudoswap.getPoolDetails(orderParams.pool);
      if (!pool) {
        throw new Error("Could not fetch pool details");
      }

      const poolContract = new Contract(
        pool.address,
        new Interface([
          `
            function getSellNFTQuote(uint256 numNFTs) view returns (
                uint8 error,
                uint256 newSpotPrice,
                uint256 newDelta,
                uint256 outputAmount,
                uint256 protocolFee
            )
          `,
        ]),
        baseProvider
      );

      if (
        [SudoswapPoolKind.TOKEN, SudoswapPoolKind.TRADE].includes(pool.poolKind) &&
        pool.token === Sdk.Common.Addresses.Eth[config.chainId]
      ) {
        const tokenBalance = await baseProvider.getBalance(pool.address);

        // TODO: Simulate bonding curve math for improved efficiency
        const prices = [bn(0)];
        let totalPrice = bn(0);

        // For now, we get at most 10 prices (ideally we use off-chain simulation or multicall)
        let i = 0;
        while (i < 10) {
          const result = await poolContract.getSellNFTQuote(prices.length);
          if (result.error !== 0 || result.outputAmount.gt(tokenBalance)) {
            break;
          }

          prices.push(result.outputAmount.sub(totalPrice));
          totalPrice = totalPrice.add(prices[prices.length - 1]);

          i++;
        }

        // We can only have a single currently active order per pool and side
        const id = getOrderId(orderParams.pool, "buy");
        if (prices.length > 1) {
          // Handle: fees
          let feeBps = 50;
          const feeBreakdown: {
            kind: string;
            recipient: string;
            bps: number;
          }[] = [
            {
              kind: "marketplace",
              recipient: "0x4e2f98c96e2d595a83afa35888c4af58ac343e44",
              bps: 50,
            },
          ];

          const eip2981Royalties = await royalties.getRoyalties(pool.nft, undefined, "eip2981");
          for (const { recipient, bps } of eip2981Royalties) {
            feeBps += bps;
            feeBreakdown.push({
              kind: "royalty",
              recipient,
              bps,
            });
          }

          // Add the protocol fee to the price
          const price = prices[1].add(prices[1].mul(50).div(10000)).toString();
          // Subtract the royalties from the price
          const value = prices[1].sub(prices[1].mul(feeBps - 50).div(10000)).toString();

          const sdkOrder: Sdk.Sudoswap.Order = new Sdk.Sudoswap.Order(config.chainId, {
            pair: orderParams.pool,
            price: value.toString(),
          });

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (sdkOrder.params as any).extra = {
            values: prices
              .slice(1)
              .map((p) => p.mul(feeBps - 50).div(10000))
              .map(String),
          };

          const orderResult = await redb.oneOrNone(
            `
              SELECT 1 FROM orders
              WHERE orders.id = $/id/
            `,
            { id }
          );
          if (!orderResult) {
            // Handle: token set
            const schemaHash = generateSchemaHash();
            const [{ id: tokenSetId }] = await tokenSet.contractWide.save([
              {
                id: `contract:${pool.nft}`,
                schemaHash,
                contract: pool.nft,
              },
            ]);
            if (!tokenSetId) {
              throw new Error("No token set available");
            }

            // Handle: source
            const sources = await Sources.getInstance();
            const source = await sources.getOrInsert("sudoswap.xyz");

            const validFrom = `date_trunc('seconds', to_timestamp(${orderParams.txTimestamp}))`;
            const validTo = `'Infinity'`;
            orderValues.push({
              id,
              kind: "sudoswap",
              side: "buy",
              fillability_status: "fillable",
              approval_status: "approved",
              token_set_id: tokenSetId,
              token_set_schema_hash: toBuffer(schemaHash),
              maker: toBuffer(pool.address),
              taker: toBuffer(AddressZero),
              price,
              value,
              currency: toBuffer(pool.token),
              currency_price: price,
              currency_value: value,
              needs_conversion: null,
              quantity_remaining: (prices.length - 1).toString(),
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
            });

            return results.push({
              id,
              txHash: orderParams.txHash,
              status: "success",
            });
          } else {
            await idb.none(
              `
                UPDATE orders SET
                  fillability_status = 'fillable',
                  price = $/price/,
                  currency_price = $/price/,
                  value = $/value/,
                  currency_value = $/value/,
                  valid_between = tstzrange(date_trunc('seconds', to_timestamp(${orderParams.txTimestamp})), 'Infinity', '[]'),
                  expiration = 'Infinity',
                  updated_at = now(),
                  raw_data = $/rawData:json/
                WHERE orders.id = $/id/
              `,
              {
                price,
                value,
                rawData: sdkOrder.params,
                id,
              }
            );

            return results.push({
              id,
              txHash: orderParams.txHash,
              status: "success",
            });
          }
        } else {
          await idb.none(
            `
              UPDATE orders SET
                fillability_status = 'no-balance',
                expiration = to_timestamp(${orderParams.txTimestamp}),
                updated_at = now()
              WHERE orders.id = $/id/
            `,
            { id }
          );

          return results.push({
            id,
            txHash: orderParams.txHash,
            status: "success",
          });
        }
      }
    } catch (error) {
      logger.error(
        "orders-sudoswap-save",
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
      ],
      {
        table: "orders",
      }
    );
    await idb.none(pgp.helpers.insert(orderValues, columns) + " ON CONFLICT DO NOTHING");

    await ordersUpdateById.addToQueue(
      results.map(
        ({ id, txHash }) =>
          ({
            context: `new-order-${id}-${txHash}`,
            id,
            trigger: {
              kind: "new-order",
            },
          } as ordersUpdateById.OrderInfo)
      )
    );
  }

  return results;
};
