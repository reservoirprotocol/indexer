import { AddressZero } from "@ethersproject/constants";
import * as Sdk from "@reservoir0x/sdk";
import pLimit from "p-limit";

import { idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { bn, now, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import * as arweaveRelay from "@/jobs/arweave-relay";
import * as ordersUpdateById from "@/jobs/order-updates/by-id-queue";
import { DbOrder, OrderMetadata, generateSchemaHash } from "@/orderbook/orders/utils";
import { offChainCheck } from "@/orderbook/orders/seaport/check";
import * as tokenSet from "@/orderbook/token-sets";
import { Sources } from "@/models/sources";
import { getUSDAndNativePrices } from "@/utils/prices";
import { BigNumber } from "@ethersproject/bignumber";

export type OrderInfo = {
  orderParams: Sdk.Seaport.Types.OrderComponents;
  metadata: OrderMetadata;
  isReservoir?: boolean;
};

type SaveResult = {
  id: string;
  status: string;
  unfillable?: boolean;
};

export const save = async (
  orderInfos: OrderInfo[],
  relayToArweave?: boolean
): Promise<SaveResult[]> => {
  const results: SaveResult[] = [];
  const orderValues: DbOrder[] = [];

  const arweaveData: {
    order: Sdk.Seaport.Order | Sdk.Seaport.BundleOrder;
    schemaHash?: string;
    source?: string;
  }[] = [];

  const handleOrder = async ({ orderParams, isReservoir, metadata }: OrderInfo) => {
    try {
      const order = new Sdk.Seaport.Order(config.chainId, orderParams);
      const info = order.getInfo();
      const id = order.hash();

      // Check: order has a valid format
      if (!info) {
        return results.push({
          id,
          status: "invalid-format",
        });
      }

      // Check: order doesn't already exist
      const orderExists = await idb.oneOrNone(`SELECT 1 FROM orders WHERE orders.id = $/id/`, {
        id,
      });
      if (orderExists) {
        return results.push({
          id,
          status: "already-exists",
        });
      }

      // Check: order has a non-zero price
      if (bn(info.price).lte(0)) {
        return results.push({
          id,
          status: "zero-price",
        });
      }

      const currentTime = now();

      // Check: order has a valid start time
      const startTime = order.params.startTime;
      if (startTime - 5 * 60 >= currentTime) {
        // TODO: Add support for not-yet-valid orders
        return results.push({
          id,
          status: "invalid-start-time",
        });
      }

      // Check: order is not expired
      const endTime = order.params.endTime;
      if (currentTime >= endTime) {
        return results.push({
          id,
          status: "expired",
        });
      }

      // Check: sell order has Eth as payment token
      if (
        info.side === "sell" &&
        info.paymentToken !== Sdk.Common.Addresses.Eth[config.chainId] &&
        !isReservoir
      ) {
        return results.push({
          id,
          status: "unsupported-payment-token",
        });
      }

      // Check: buy order has Weth as payment token
      if (info.side === "buy" && info.paymentToken !== Sdk.Common.Addresses.Weth[config.chainId]) {
        return results.push({
          id,
          status: "unsupported-payment-token",
        });
      }

      // Check: order has a known zone
      if (
        ![
          // No zone
          AddressZero,
          // Are these really used?
          "0xf397619df7bfd4d1657ea9bdd9df7ff888731a11",
          "0x9b814233894cd227f561b78cc65891aa55c62ad2",
          // Pausable zone
          Sdk.Seaport.Addresses.PausableZone[config.chainId],
        ].includes(order.params.zone)
      ) {
        return results.push({
          id,
          status: "unsupported-zone",
        });
      }

      // Check: order is valid
      try {
        order.checkValidity();
      } catch {
        return results.push({
          id,
          status: "invalid",
        });
      }

      // Check: order has a valid signature
      try {
        order.checkSignature();
      } catch {
        return results.push({
          id,
          status: "invalid-signature",
        });
      }

      // Check: order fillability
      let fillabilityStatus = "fillable";
      let approvalStatus = "approved";
      try {
        await offChainCheck(order, { onChainApprovalRecheck: true });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (error: any) {
        // Keep any orders that can potentially get valid in the future
        if (error.message === "no-balance-no-approval") {
          fillabilityStatus = "no-balance";
          approvalStatus = "no-approval";
        } else if (error.message === "no-approval") {
          approvalStatus = "no-approval";
        } else if (error.message === "no-balance") {
          fillabilityStatus = "no-balance";
        } else {
          return results.push({
            id,
            status: "not-fillable",
          });
        }
      }

      // Check and save: associated token set
      const schemaHash = metadata.schemaHash ?? generateSchemaHash(metadata.schema);

      let tokenSetId: string | undefined;
      switch (order.params.kind) {
        case "single-token": {
          const typedInfo = info as typeof info & { tokenId: string };
          const tokenId = typedInfo.tokenId;

          tokenSetId = `token:${info.contract}:${tokenId}`;
          if (tokenId) {
            await tokenSet.singleToken.save([
              {
                id: tokenSetId,
                schemaHash,
                contract: info.contract,
                tokenId,
              },
            ]);
          }

          break;
        }

        case "contract-wide": {
          tokenSetId = `contract:${info.contract}`;
          await tokenSet.contractWide.save([
            {
              id: tokenSetId,
              schemaHash,
              contract: info.contract,
            },
          ]);

          break;
        }

        case "token-list": {
          const typedInfo = info as typeof info & { merkleRoot: string };
          const merkleRoot = typedInfo.merkleRoot;

          if (merkleRoot) {
            tokenSetId = `list:${info.contract}:${BigNumber.from(merkleRoot).toHexString()}`;

            await tokenSet.tokenList.save([
              {
                id: tokenSetId,
                schemaHash,
                schema: metadata.schema,
              },
            ]);
          }

          break;
        }
      }

      if (!tokenSetId) {
        return results.push({
          id,
          status: "invalid-token-set",
        });
      }

      // Handle: fees
      let feeAmount = order.getFeeAmount();

      // Handle: price and value
      let price = bn(order.getMatchingPrice());
      let value = price;
      if (info.side === "buy") {
        // For buy orders, we set the value as `price - fee` since it
        // is best for UX to show the user exactly what they're going
        // to receive on offer acceptance.
        value = bn(price).sub(feeAmount);
      }

      // The price, value and fee are for a single item
      if (bn(info.amount).gt(1)) {
        price = price.div(info.amount);
        value = value.div(info.amount);
        feeAmount = feeAmount.div(info.amount);
      }

      const feeBps = price.eq(0) ? bn(0) : feeAmount.mul(10000).div(price);
      if (feeBps.gt(10000)) {
        return results.push({
          id,
          status: "fees-too-high",
        });
      }

      // Handle: fee breakdown
      const openSeaFeeRecipients = [
        "0x5b3256965e7c3cf26e11fcaf296dfc8807c01073",
        "0x8de9c5a032463c561423387a9648c5c7bcc5bc90",
        "0x0000a26b00c1f0df003000390027140000faa719",
      ];

      const feeBreakdown = info.fees.map(({ recipient, amount }) => ({
        kind: openSeaFeeRecipients.includes(recipient.toLowerCase()) ? "marketplace" : "royalty",
        recipient,
        bps: price.eq(0) ? 0 : bn(amount).mul(10000).div(price).toNumber(),
      }));

      // Handle: source
      const sources = await Sources.getInstance();
      let source = await sources.getOrInsert("opensea.io");

      if (metadata.source) {
        source = await sources.getOrInsert(metadata.source);
      }

      // Handle: price conversion
      const currency = info.paymentToken;

      const currencyPrice = price.toString();
      const currencyValue = value.toString();

      let needsConversion = false;
      if (
        ![
          Sdk.Common.Addresses.Eth[config.chainId],
          Sdk.Common.Addresses.Weth[config.chainId],
        ].includes(currency)
      ) {
        needsConversion = true;

        // If the currency is anything other than ETH/WETH, we convert
        // `price` and `value` from that currency denominations to the
        // ETH denomination
        {
          const prices = await getUSDAndNativePrices(currency, price.toString(), currentTime);
          if (!prices.nativePrice) {
            // Getting the native price is a must
            return results.push({
              id,
              status: "failed-to-convert-price",
            });
          }
          price = bn(prices.nativePrice);
        }
        {
          const prices = await getUSDAndNativePrices(currency, value.toString(), currentTime);
          if (!prices.nativePrice) {
            // Getting the native price is a must
            return results.push({
              id,
              status: "failed-to-convert-price",
            });
          }
          value = bn(prices.nativePrice);
        }
      }

      const validFrom = `date_trunc('seconds', to_timestamp(${startTime}))`;
      const validTo = endTime
        ? `date_trunc('seconds', to_timestamp(${order.params.endTime}))`
        : "'infinity'";
      orderValues.push({
        id,
        kind: "seaport",
        side: info.side,
        fillability_status: fillabilityStatus,
        approval_status: approvalStatus,
        token_set_id: tokenSetId,
        token_set_schema_hash: toBuffer(schemaHash),
        offer_bundle_id: null,
        consideration_bundle_id: null,
        bundle_kind: null,
        maker: toBuffer(order.params.offerer),
        taker: toBuffer(info.taker),
        price: price.toString(),
        value: value.toString(),
        currency: toBuffer(info.paymentToken),
        currency_price: currencyPrice.toString(),
        currency_value: currencyValue.toString(),
        needs_conversion: needsConversion,
        valid_between: `tstzrange(${validFrom}, ${validTo}, '[]')`,
        nonce: order.params.counter,
        source_id_int: source?.id,
        is_reservoir: isReservoir ? isReservoir : null,
        contract: toBuffer(info.contract),
        conduit: toBuffer(
          new Sdk.Seaport.Exchange(config.chainId).deriveConduit(order.params.conduitKey)
        ),
        fee_bps: feeBps.toNumber(),
        fee_breakdown: feeBreakdown || null,
        dynamic: info.isDynamic ?? null,
        raw_data: order.params,
        expiration: validTo,
      });

      const unfillable =
        fillabilityStatus !== "fillable" || approvalStatus !== "approved" ? true : undefined;

      results.push({
        id,
        status: "success",
        unfillable,
      });

      if (relayToArweave) {
        arweaveData.push({ order, schemaHash, source: source?.domain });
      }
    } catch (error) {
      logger.warn(
        "orders-seaport-save",
        `Failed to handle order with params ${JSON.stringify(orderParams)}: ${error} (will retry)`
      );

      // Throw so that we retry with he bundle-handling code
      throw error;
    }
  };

  // const handleBundleOrder = async ({ orderParams, isReservoir, metadata }: OrderInfo) => {
  //   try {
  //     const order = new Sdk.Seaport.BundleOrder(config.chainId, orderParams);
  //     const info = order.getInfo();
  //     const id = order.hash();

  //     // Check: order has a valid format
  //     if (!info) {
  //       return results.push({
  //         id,
  //         status: "invalid-format",
  //       });
  //     }

  //     // Check: order doesn't already exist
  //     const orderExists = await idb.oneOrNone(`SELECT 1 FROM orders WHERE orders.id = $/id/`, {
  //       id,
  //     });
  //     if (orderExists) {
  //       return results.push({
  //         id,
  //         status: "already-exists",
  //       });
  //     }

  //     const currentTime = now();

  //     // Check: order has a valid start time
  //     const startTime = order.params.startTime;
  //     if (startTime - 5 * 60 >= currentTime) {
  //       // TODO: Add support for not-yet-valid orders
  //       return results.push({
  //         id,
  //         status: "invalid-start-time",
  //       });
  //     }

  //     // Check: order is not expired
  //     const endTime = order.params.endTime;
  //     if (currentTime >= endTime) {
  //       return results.push({
  //         id,
  //         status: "expired",
  //       });
  //     }

  //     // Check: order has a known zone
  //     if (
  //       ![
  //         // No zone
  //         AddressZero,
  //         // Are these really used?
  //         "0xf397619df7bfd4d1657ea9bdd9df7ff888731a11",
  //         "0x9b814233894cd227f561b78cc65891aa55c62ad2",
  //         // Pausable zone
  //         Sdk.Seaport.Addresses.PausableZone[config.chainId],
  //       ].includes(order.params.zone)
  //     ) {
  //       return results.push({
  //         id,
  //         status: "unsupported-zone",
  //       });
  //     }

  //     // Check: order is valid
  //     try {
  //       order.checkValidity();
  //     } catch {
  //       return results.push({
  //         id,
  //         status: "invalid",
  //       });
  //     }

  //     // Check: order has a valid signature
  //     try {
  //       order.checkSignature();
  //     } catch (error) {
  //       return results.push({
  //         id,
  //         status: "invalid-signature",
  //       });
  //     }

  //     // Check: order fillability
  //     let fillabilityStatus = "fillable";
  //     let approvalStatus = "approved";
  //     try {
  //       await offChainCheckBundle(order, { onChainApprovalRecheck: true });
  //       // eslint-disable-next-line @typescript-eslint/no-explicit-any
  //     } catch (error: any) {
  //       // Keep any orders that can potentially get valid in the future
  //       if (error.message === "no-balance-no-approval") {
  //         fillabilityStatus = "no-balance";
  //         approvalStatus = "no-approval";
  //       } else if (error.message === "no-approval") {
  //         approvalStatus = "no-approval";
  //       } else if (error.message === "no-balance") {
  //         fillabilityStatus = "no-balance";
  //       } else {
  //         return results.push({
  //           id,
  //           status: "not-fillable",
  //         });
  //       }
  //     }

  //     // TODO: Add support for non-token token sets
  //     const tokenSets = await tokenSet.singleToken.save(
  //       info.offerItems.map((item) => ({
  //         id: `token:${item.contract}:${item.tokenId!}`,
  //         schemaHash: generateSchemaHash(),
  //         contract: item.contract,
  //         tokenId: item.tokenId!,
  //       }))
  //     );

  //     // TODO: Add support for consideration bundles
  //     const offerBundle = await bundles.create(tokenSets.map(({ id }) => ({ kind: "nft", id })));

  //     // eslint-disable-next-line @typescript-eslint/no-explicit-any
  //     const currency = (info as any).paymentToken;
  //     if (order.params.kind === "bundle-ask") {
  //       // Check: order has a non-zero price
  //       // eslint-disable-next-line @typescript-eslint/no-explicit-any
  //       if (bn((info as any).price).lte(0)) {
  //         return results.push({
  //           id,
  //           status: "zero-price",
  //         });
  //       }
  //     }

  //     // Handle: price and value
  //     let price = bn(order.getMatchingPrice());
  //     const currencyPrice = price;
  //     let value = price;

  //     // Handle: fees
  //     const feeAmount = order.getFeeAmount();

  //     const feeBps = price.eq(0) ? bn(0) : feeAmount.mul(10000).div(price);
  //     if (feeBps.gt(10000)) {
  //       return results.push({
  //         id,
  //         status: "fees-too-high",
  //       });
  //     }

  //     // Handle: fee breakdown
  //     const openSeaFeeRecipients = [
  //       "0x5b3256965e7c3cf26e11fcaf296dfc8807c01073",
  //       "0x8de9c5a032463c561423387a9648c5c7bcc5bc90",
  //     ];

  //     // eslint-disable-next-line @typescript-eslint/no-explicit-any
  //     const feeBreakdown = ((info as any) || []).fees.map(
  //       ({ recipient, amount }: { recipient: string; amount: string }) => ({
  //         kind: openSeaFeeRecipients.includes(recipient.toLowerCase()) ? "marketplace" : "royalty",
  //         recipient,
  //         bps: price.eq(0) ? 0 : bn(amount).mul(10000).div(price).toNumber(),
  //       })
  //     );

  //     // Handle: source
  //     const sources = await Sources.getInstance();
  //     let source;

  //     if (metadata.source) {
  //       source = await sources.getOrInsert(metadata.source);
  //     } else {
  //       // If one of the fees is marketplace the source of the order is opensea
  //       for (const fee of feeBreakdown) {
  //         if (fee.kind == "marketplace") {
  //           source = await sources.getOrInsert("opensea.io");
  //           break;
  //         }
  //       }
  //     }

  //     // Handle: price conversion
  //     {
  //       const prices = await getUSDAndNativePrices(
  //         currency,
  //         price.toString(),
  //         currentTime
  //       );
  //       if (!prices.nativePrice) {
  //         // Getting the native price is a must
  //         return results.push({
  //           id,
  //           status: "failed-to-convert-price",
  //         });
  //       }
  //       price = bn(prices.nativePrice);
  //     }
  //     {
  //       const prices = await getUSDAndNativePrices(
  //         currency,
  //         value.toString(),
  //         currentTime
  //       );
  //       if (!prices.nativePrice) {
  //         // Getting the native price is a must
  //         return results.push({
  //           id,
  //           status: "failed-to-convert-price",
  //         });
  //       }
  //       value = bn(prices.nativePrice);
  //     }

  //     const validFrom = `date_trunc('seconds', to_timestamp(${startTime}))`;
  //     const validTo = endTime
  //       ? `date_trunc('seconds', to_timestamp(${order.params.endTime}))`
  //       : "'infinity'";
  //     orderValues.push({
  //       id,
  //       kind: "seaport",
  //       side: "bundle",
  //       fillability_status: fillabilityStatus,
  //       approval_status: approvalStatus,
  //       token_set_id: null,
  //       token_set_schema_hash: null,
  //       offer_bundle_id: offerBundle,
  //       consideration_bundle_id: undefined,
  //       // eslint-disable-next-line @typescript-eslint/no-explicit-any
  //       bundle_kind: order.params.kind as any,
  //       contract: null,
  //       maker: toBuffer(order.params.offerer),
  //       taker: toBuffer(info.taker),
  //       price: price.toString(),
  //       value: value.toString(),
  //       currency: currency ? toBuffer(currency) : undefined,
  //       currency_price: currencyPrice.toString(),
  //       valid_between: `tstzrange(${validFrom}, ${validTo}, '[]')`,
  //       nonce: order.params.counter,
  //       source_id_int: source?.id,
  //       is_reservoir: isReservoir ? isReservoir : null,
  //       conduit: toBuffer(
  //         new Sdk.Seaport.Exchange(config.chainId).deriveConduit(order.params.conduitKey)
  //       ),
  //       fee_breakdown: feeBreakdown,
  //       fee_bps: feeBps.toNumber(),
  //       raw_data: order.params,
  //       dynamic: null,
  //       expiration: validTo,
  //     });

  //     results.push({
  //       id,
  //       status: "success",
  //       unfillable:
  //         fillabilityStatus !== "fillable" || approvalStatus !== "approved" ? true : undefined,
  //     });

  //     if (relayToArweave) {
  //       arweaveData.push({ order, source: source?.domain });
  //     }
  //   } catch (error) {
  //     logger.error(
  //       "orders-seaport-save-bundle",
  //       `Failed to handle bundle order with params ${JSON.stringify(orderParams)}: ${error}`
  //     );
  //   }
  // };

  // Process all orders concurrently
  const limit = pLimit(20);
  await Promise.all(orderInfos.map((orderInfo) => limit(async () => handleOrder(orderInfo))));

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
        "offer_bundle_id",
        "consideration_bundle_id",
        "bundle_kind",
        "maker",
        "taker",
        "price",
        "value",
        "currency",
        "currency_price",
        "currency_value",
        "needs_conversion",
        { name: "valid_between", mod: ":raw" },
        "nonce",
        "source_id_int",
        "is_reservoir",
        "contract",
        "conduit",
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
      results
        .filter((r) => r.status === "success" && !r.unfillable)
        .map(
          ({ id }) =>
            ({
              context: `new-order-${id}`,
              id,
              trigger: {
                kind: "new-order",
              },
            } as ordersUpdateById.OrderInfo)
        )
    );

    if (relayToArweave) {
      await arweaveRelay.addPendingOrdersSeaport(arweaveData);
    }
  }

  return results;
};
