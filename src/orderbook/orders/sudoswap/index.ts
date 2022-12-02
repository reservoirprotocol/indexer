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
import * as commonHelpers from "@/orderbook/orders/common/helpers";
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

export const getOrderId = (pool: string, side: "sell" | "buy", tokenId?: string) =>
  side === "buy"
    ? // Buy orders have a single order id per pool
      keccak256(["string", "address", "string"], ["sudoswap", pool, side])
    : // Sell orders have multiple order ids per pool (one for each potential token id)
      keccak256(["string", "address", "string", "uint256"], ["sudoswap", pool, side, tokenId]);

export const save = async (orderInfos: OrderInfo[]): Promise<SaveResult[]> => {
  const results: SaveResult[] = [];
  const orderValues: DbOrder[] = [];

  const handleOrder = async ({ orderParams }: OrderInfo) => {
    try {
      const pool = await sudoswap.getPoolDetails(orderParams.pool);
      if (!pool) {
        throw new Error("Could not fetch pool details");
      }

      if (pool.token !== Sdk.Common.Addresses.Eth[config.chainId]) {
        throw new Error("Unsupported currency");
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
          `
            function getBuyNFTQuote(uint256 numNFTs) view returns (
              uint8 error,
              uint256 newSpotPrice,
              uint256 newDelta,
              uint256 inputAmount,
              uint256 protocolFee
            )
          `,
        ]),
        baseProvider
      );

      // Handle: fees
      const feeBps = 50;
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

      // Handle buy orders
      try {
        if ([SudoswapPoolKind.TOKEN, SudoswapPoolKind.TRADE].includes(pool.poolKind)) {
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

          const id = getOrderId(orderParams.pool, "buy");
          if (prices.length > 1) {
            // Handle: prices
            const price = prices[1].toString();
            const value = prices[1]
              .sub(
                // Subtract the protocol fee from the price
                prices[1].mul(feeBps).div(10000)
              )
              .toString();

            // Handle: royalties on top
            const defaultRoyalties = await royalties.getRoyaltiesByTokenSet(
              `contract:${pool.nft}`,
              "default"
            );

            const totalBuiltInBps = 0;
            const totalDefaultBps = defaultRoyalties
              .map(({ bps }) => bps)
              .reduce((a, b) => a + b, 0);

            const missingRoyalties = [];
            let missingRoyaltyAmount = bn(0);
            if (totalBuiltInBps < totalDefaultBps) {
              const validRecipients = defaultRoyalties.filter(
                ({ bps, recipient }) => bps && recipient !== AddressZero
              );
              if (validRecipients.length) {
                const bpsDiff = totalDefaultBps - totalBuiltInBps;
                const amount = bn(price).mul(bpsDiff).div(10000).toString();
                missingRoyaltyAmount = missingRoyaltyAmount.add(amount);

                missingRoyalties.push({
                  bps: bpsDiff,
                  amount,
                  // TODO: We should probably split pro-rata across all royalty recipients
                  recipient: validRecipients[0].recipient,
                });
              }
            }

            const normalizedValue = bn(value).sub(missingRoyaltyAmount);

            // Handle: core sdk order
            const sdkOrder: Sdk.Sudoswap.Order = new Sdk.Sudoswap.Order(config.chainId, {
              pair: orderParams.pool,
              extra: {
                prices: prices.slice(1).map(String),
              },
            });

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
                missing_royalties: missingRoyalties,
                normalized_value: normalizedValue.toString(),
                currency_normalized_value: normalizedValue.toString(),
              });

              results.push({
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
                    quantity_remaining = $/quantityRemaining/,
                    valid_between = tstzrange(date_trunc('seconds', to_timestamp(${orderParams.txTimestamp})), 'Infinity', '[]'),
                    expiration = 'Infinity',
                    updated_at = now(),
                    raw_data = $/rawData:json/,
                    missing_royalties = $/missingRoyalties:json/,
                    normalized_value = $/normalizedValue/,
                    currency_normalized_value = $/currencyNormalizedValue/,
                    fee_bps = $/feeBps/,
                    fee_breakdown = $/feeBreakdown:json/
                  WHERE orders.id = $/id/
                `,
                {
                  id,
                  price,
                  value,
                  rawData: sdkOrder.params,
                  quantityRemaining: (prices.length - 1).toString(),
                  missingRoyalties: missingRoyalties,
                  normalizedValue: normalizedValue.toString(),
                  currencyNormalizedValue: normalizedValue.toString(),
                  feeBps,
                  feeBreakdown,
                }
              );

              await ordersUpdateById.addToQueue([
                {
                  context: `reprice-${id}-${orderParams.txHash}`,
                  id,
                  trigger: {
                    kind: "reprice",
                  },
                },
              ]);

              results.push({
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

            await ordersUpdateById.addToQueue([
              {
                context: `reprice-${id}-${orderParams.txHash}`,
                id,
                trigger: {
                  kind: "reprice",
                },
              },
            ]);

            results.push({
              id,
              txHash: orderParams.txHash,
              status: "success",
            });
          }
        }
      } catch (error) {
        logger.error(
          "orders-sudoswap-save",
          `Failed to handle buy order with params ${JSON.stringify(orderParams)}: ${error}`
        );
      }

      // Handle sell orders
      try {
        if ([SudoswapPoolKind.NFT, SudoswapPoolKind.TRADE].includes(pool.poolKind)) {
          // TODO: Simulate bonding curve math for improved efficiency
          const prices = [bn(0)];
          let totalPrice = bn(0);

          // For now, we get at most 10 prices (ideally we use off-chain simulation or multicall)
          let i = 0;
          while (i < 10) {
            const result = await poolContract.getBuyNFTQuote(prices.length);
            if (result.error !== 0) {
              break;
            }

            prices.push(result.inputAmount.sub(totalPrice));
            totalPrice = totalPrice.add(prices[prices.length - 1]);

            i++;
          }

          // Handle: prices
          const price = prices[1].toString();
          const value = prices[1].toString();

          // Handle: royalties on top
          const defaultRoyalties = await royalties.getRoyaltiesByTokenSet(
            `contract:${pool.nft}`,
            "default"
          );

          const totalBuiltInBps = 0;
          const totalDefaultBps = defaultRoyalties.map(({ bps }) => bps).reduce((a, b) => a + b, 0);

          const missingRoyalties = [];
          let missingRoyaltyAmount = bn(0);
          if (totalBuiltInBps < totalDefaultBps) {
            const validRecipients = defaultRoyalties.filter(
              ({ bps, recipient }) => bps && recipient !== AddressZero
            );
            if (validRecipients.length) {
              const bpsDiff = totalDefaultBps - totalBuiltInBps;
              const amount = bn(price).mul(bpsDiff).div(10000).toString();
              missingRoyaltyAmount = missingRoyaltyAmount.add(amount);

              missingRoyalties.push({
                bps: bpsDiff,
                amount,
                // TODO: We should probably split pro-rata across all royalty recipients
                recipient: validRecipients[0].recipient,
              });
            }
          }

          const normalizedValue = bn(value).add(missingRoyaltyAmount);

          // Fetch all token ids owned by the pool
          const poolOwnedTokenIds = await commonHelpers.getNfts(pool.nft, pool.address);
          for (const tokenId of poolOwnedTokenIds) {
            try {
              const id = getOrderId(orderParams.pool, "sell", tokenId);

              // Handle: core sdk order
              const sdkOrder: Sdk.Sudoswap.Order = new Sdk.Sudoswap.Order(config.chainId, {
                pair: orderParams.pool,
                tokenId,
                extra: {
                  prices: prices.slice(1).map(String),
                },
              });

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
                const [{ id: tokenSetId }] = await tokenSet.singleToken.save([
                  {
                    id: `token:${pool.nft}:${tokenId}`,
                    schemaHash,
                    contract: pool.nft,
                    tokenId,
                  },
                ]);
                if (!tokenSetId) {
                  throw new Error("No token set available");
                }

                // Handle: source
                // const sources = await Sources.getInstance();
                // const source = await sources.getOrInsert("sudoswap.xyz");

                // const validFrom = `date_trunc('seconds', to_timestamp(${orderParams.txTimestamp}))`;
                // const validTo = `'Infinity'`;
                // orderValues.push({
                //   id,
                //   kind: "sudoswap",
                //   side: "sell",
                //   fillability_status: "fillable",
                //   approval_status: "approved",
                //   token_set_id: tokenSetId,
                //   token_set_schema_hash: toBuffer(schemaHash),
                //   maker: toBuffer(pool.address),
                //   taker: toBuffer(AddressZero),
                //   price,
                //   value,
                //   currency: toBuffer(pool.token),
                //   currency_price: price,
                //   currency_value: value,
                //   needs_conversion: null,
                //   quantity_remaining: "1",
                //   valid_between: `tstzrange(${validFrom}, ${validTo}, '[]')`,
                //   nonce: null,
                //   source_id_int: source?.id,
                //   is_reservoir: null,
                //   contract: toBuffer(pool.nft),
                //   conduit: null,
                //   fee_bps: feeBps,
                //   fee_breakdown: feeBreakdown,
                //   dynamic: null,
                //   raw_data: sdkOrder.params,
                //   expiration: validTo,
                //   missing_royalties: missingRoyalties,
                //   normalized_value: normalizedValue.toString(),
                //   currency_normalized_value: normalizedValue.toString(),
                // });

                // results.push({
                //   id,
                //   txHash: orderParams.txHash,
                //   status: "success",
                // });
              } else {
                await idb.none(
                  `
                    UPDATE orders SET
                      fillability_status = 'fillable',
                      price = $/price/,
                      currency_price = $/price/,
                      value = $/value/,
                      currency_value = $/value/,
                      quantity_remaining = 1,
                      valid_between = tstzrange(date_trunc('seconds', to_timestamp(${orderParams.txTimestamp})), 'Infinity', '[]'),
                      expiration = 'Infinity',
                      updated_at = now(),
                      raw_data = $/rawData:json/,
                      missing_royalties = $/missingRoyalties:json/,
                      normalized_value = $/normalizedValue/,
                      currency_normalized_value = $/currencyNormalizedValue/,
                      fee_bps = $/feeBps/,
                      fee_breakdown = $/feeBreakdown:json/
                    WHERE orders.id = $/id/
                  `,
                  {
                    id,
                    price,
                    value,
                    rawData: sdkOrder.params,
                    missingRoyalties: missingRoyalties,
                    normalizedValue: normalizedValue.toString(),
                    currencyNormalizedValue: normalizedValue.toString(),
                    feeBps,
                    feeBreakdown,
                  }
                );

                await ordersUpdateById.addToQueue([
                  {
                    context: `reprice-${id}-${orderParams.txHash}`,
                    id,
                    trigger: {
                      kind: "reprice",
                    },
                  },
                ]);

                results.push({
                  id,
                  txHash: orderParams.txHash,
                  status: "success",
                });
              }
            } catch {
              // Ignore any errors
            }
          }
        }
      } catch (error) {
        logger.error(
          "orders-sudoswap-save",
          `Failed to handle sell order with params ${JSON.stringify(orderParams)}: ${error}`
        );
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
        { name: "missing_royalties", mod: ":json" },
        "normalized_value",
        "currency_normalized_value",
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
