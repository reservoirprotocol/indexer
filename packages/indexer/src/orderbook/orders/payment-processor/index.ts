import { Interface } from "@ethersproject/abi";
import { BigNumber } from "@ethersproject/bignumber";
import { AddressZero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import { keccak256 } from "@ethersproject/solidity";
import * as Sdk from "@reservoir0x/sdk";
import _ from "lodash";
import pLimit from "p-limit";

import { idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { bn, now, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { Sources } from "@/models/sources";
import {
  OrderUpdatesByIdJobPayload,
  orderUpdatesByIdJob,
} from "@/jobs/order-updates/order-updates-by-id-job";
import { offChainCheck } from "@/orderbook/orders/payment-processor/check";
import { DbOrder, OrderMetadata, generateSchemaHash } from "@/orderbook/orders/utils";
import * as tokenSet from "@/orderbook/token-sets";
import { checkMarketplaceIsFiltered } from "@/utils/marketplace-blacklists";
import { getUSDAndNativePrices } from "@/utils/prices";
import * as royalties from "@/utils/royalties";

export type OrderInfo = {
  orderParams: Sdk.PaymentProcessor.Types.BaseOrder;
  metadata: OrderMetadata;
};

type SaveResult = {
  id: string;
  status: string;
  unfillable?: boolean;
};

export const getOrderNonce = (marketplace: string, nonce: string) => {
  const hash = keccak256(["address", "uint256"], [marketplace, nonce]);
  return BigNumber.from(hash).toString();
};

export const save = async (orderInfos: OrderInfo[]): Promise<SaveResult[]> => {
  const results: SaveResult[] = [];
  const orderValues: DbOrder[] = [];

  const handleOrder = async ({ orderParams, metadata }: OrderInfo) => {
    try {
      const order = new Sdk.PaymentProcessor.Order(config.chainId, {
        ...orderParams,
        // Force kind detection
        kind: undefined,
      });
      const id = order.hash();

      if (!order.params.kind) {
        return results.push({
          id,
          status: "unknown-kind",
        });
      }

      // For now, only single amounts are supported
      if (order.params.amount !== "1") {
        return results.push({
          id,
          status: "unsupported-amount",
        });
      }

      if (order.params.coin !== Sdk.Common.Addresses.Native[config.chainId]) {
        const exchange = new Contract(
          Sdk.PaymentProcessor.Addresses.Exchange[config.chainId],
          new Interface([
            "function getTokenSecurityPolicyId(address collectionAddress) public view returns (uint256)",
            `function getSecurityPolicy(uint256 securityPolicyId) public view returns (
              (
                bool enforceExchangeWhitelist,
                bool enforcePaymentMethodWhitelist,
                bool enforcePricingConstraints,
                bool disablePrivateListings,
                bool disableDelegatedPurchases,
                bool disableEIP1271Signatures,
                bool disableExchangeWhitelistEOABypass,
                uint32 pushPaymentGasLimit,
                address policyOwner
              ) securityPolicy
            )`,
            "function isPaymentMethodApproved(uint256 securityPolicyId, address coin) public view returns (bool)",
          ]),
          baseProvider
        );
        const securityPolicyId = await exchange.getTokenSecurityPolicyId(order.params.tokenAddress);
        const securityPolicy = await exchange.getSecurityPolicy(securityPolicyId);
        if (securityPolicy.enforcePaymentMethodWhitelist) {
          const isWhitelisted = await exchange.isPaymentMethodApproved(
            securityPolicyId,
            order.params.coin
          );
          if (!isWhitelisted) {
            return results.push({
              id,
              status: "payment-token-not-whitelisted",
            });
          }
        }
      }

      const isFiltered = await checkMarketplaceIsFiltered(order.params.tokenAddress, [
        Sdk.PaymentProcessor.Addresses.Exchange[config.chainId],
      ]);
      if (isFiltered) {
        return results.push({
          id,
          status: "filtered",
        });
      }

      // Check: order doesn't already exist
      const orderExists = await idb.oneOrNone(`SELECT 1 FROM "orders" "o" WHERE "o"."id" = $/id/`, {
        id,
      });
      if (orderExists) {
        return results.push({
          id,
          status: "already-exists",
        });
      }

      const currentTime = now();

      // Check: order is not expired
      const expirationTime = Number(order.params.expiration);
      if (currentTime >= expirationTime) {
        return results.push({
          id,
          status: "expired",
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
      let tokenSetId: string | undefined;
      const schemaHash = metadata.schemaHash ?? generateSchemaHash(metadata.schema);

      switch (order.params.kind) {
        case "offer-approval":
        case "sale-approval": {
          [{ id: tokenSetId }] = await tokenSet.singleToken.save([
            {
              id: `token:${order.params.tokenAddress}:${order.params.tokenId}`,
              schemaHash,
              contract: order.params.tokenAddress,
              tokenId: order.params.tokenId!,
            },
          ]);

          break;
        }

        case "collection-offer-approval": {
          [{ id: tokenSetId }] = await tokenSet.contractWide.save([
            {
              id: `contract:${order.params.tokenAddress}`,
              schemaHash,
              contract: order.params.tokenAddress,
            },
          ]);

          break;
        }
      }

      if (!tokenSetId) {
        return results.push({
          id,
          status: "invalid-token-set",
        });
      }

      const side = ["sale-approval"].includes(order.params.kind!) ? "sell" : "buy";

      // Handle: currency
      const currency = order.params.coin;

      // Handle: fees
      const feeBreakdown: {
        kind: string;
        recipient: string;
        bps: number;
      }[] = (
        side === "sell"
          ? await royalties.getRoyalties(order.params.tokenAddress, order.params.tokenId, "onchain")
          : await royalties.getRoyaltiesByTokenSet(tokenSetId, "onchain")
      ).map((r) => ({ kind: "royalty", ...r }));

      // Handle: royalties on top
      const defaultRoyalties =
        side === "sell"
          ? await royalties.getRoyalties(order.params.tokenAddress, order.params.tokenId, "default")
          : await royalties.getRoyaltiesByTokenSet(tokenSetId, "default");

      const totalBuiltInBps = feeBreakdown
        .map(({ bps, kind }) => (kind === "royalty" ? bps : 0))
        .reduce((a, b) => a + b, 0);
      const totalDefaultBps = defaultRoyalties.map(({ bps }) => bps).reduce((a, b) => a + b, 0);

      const currencyPrice = bn(order.params.price).div(order.params.amount).toString();

      const missingRoyalties = [];
      let missingRoyaltyAmount = bn(0);
      if (totalBuiltInBps < totalDefaultBps) {
        const validRecipients = defaultRoyalties.filter(
          ({ bps, recipient }) => bps && recipient !== AddressZero
        );
        if (validRecipients.length) {
          const bpsDiff = totalDefaultBps - totalBuiltInBps;
          const amount = bn(currencyPrice).mul(bpsDiff).div(10000);
          missingRoyaltyAmount = missingRoyaltyAmount.add(amount);

          // Split the missing royalties pro-rata across all royalty recipients
          const totalBps = _.sumBy(validRecipients, ({ bps }) => bps);
          for (const { bps, recipient } of validRecipients) {
            // TODO: Handle lost precision (by paying it to the last or first recipient)
            missingRoyalties.push({
              bps: Math.floor((bpsDiff * bps) / totalBps),
              amount: amount.mul(bps).div(totalBps).toString(),
              recipient,
            });
          }
        }
      }

      const feeBps = feeBreakdown.map(({ bps }) => bps).reduce((a, b) => Number(a) + Number(b), 0);

      // Handle: price and value
      let currencyValue: string;
      let currencyNormalizedValue: string | undefined;
      if (side === "buy") {
        // For buy orders, we set the value as `price - fee` since it
        // is best for UX to show the user exactly what they're going
        // to receive on offer acceptance.
        currencyValue = bn(currencyPrice)
          .sub(bn(currencyPrice).mul(bn(feeBps)).div(10000))
          .toString();
        // The normalized value excludes the royalties from the value
        currencyNormalizedValue = bn(currencyValue).sub(missingRoyaltyAmount).toString();
      } else {
        // For sell orders, the value is the same as the price
        currencyValue = currencyPrice;
        // The normalized value includes the royalties on top of the price
        currencyNormalizedValue = bn(currencyValue).add(missingRoyaltyAmount).toString();
      }

      // Handle: source
      const sources = await Sources.getInstance();
      let source = await sources.getOrInsert("limitbreak.com");
      if (metadata.source) {
        source = await sources.getOrInsert(metadata.source);
      }

      // Price conversion
      let price = currencyPrice;
      let value = currencyValue;

      let needsConversion = false;
      if (
        ![
          Sdk.Common.Addresses.Native[config.chainId],
          Sdk.Common.Addresses.WNative[config.chainId],
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
          price = bn(prices.nativePrice).toString();
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
          value = bn(prices.nativePrice).toString();
        }
      }

      const prices = await getUSDAndNativePrices(currency, currencyNormalizedValue, currentTime);
      if (!prices.nativePrice) {
        // Getting the native price is a must
        return results.push({
          id,
          status: "failed-to-convert-price",
        });
      }
      const normalizedValue = bn(prices.nativePrice).toString();

      // Handle: native Reservoir orders
      const isReservoir = false;

      // Handle: conduit
      const conduit = Sdk.PaymentProcessor.Addresses.Exchange[config.chainId];

      const validFrom = `date_trunc('seconds', now())`;
      const validTo = `date_trunc('seconds', to_timestamp(${order.params.expiration}))`;
      const orderNonce = getOrderNonce(order.params.marketplace, order.params.nonce);
      orderValues.push({
        id,
        kind: "payment-processor",
        side,
        fillability_status: fillabilityStatus,
        approval_status: approvalStatus,
        token_set_id: tokenSetId,
        token_set_schema_hash: toBuffer(schemaHash),
        maker: toBuffer(order.params.sellerOrBuyer),
        taker: toBuffer(AddressZero),
        price,
        value,
        currency: toBuffer(currency),
        currency_price: currencyPrice,
        currency_value: currencyValue,
        needs_conversion: needsConversion,
        valid_between: `tstzrange(${validFrom}, ${validTo}, '[]')`,
        nonce: orderNonce,
        source_id_int: source?.id,
        is_reservoir: isReservoir ? isReservoir : null,
        contract: toBuffer(order.params.tokenAddress),
        conduit: toBuffer(conduit),
        fee_bps: feeBps,
        fee_breakdown: feeBreakdown || null,
        dynamic: null,
        raw_data: order.params,
        expiration: validTo,
        missing_royalties: missingRoyalties,
        normalized_value: normalizedValue,
        currency_normalized_value: currencyNormalizedValue,
      });

      const unfillable =
        fillabilityStatus !== "fillable" || approvalStatus !== "approved" ? true : undefined;

      results.push({
        id,
        status: "success",
        unfillable,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      logger.error(
        "payment-processor",
        `Failed to handle order with params ${JSON.stringify(orderParams)}: ${error} (${
          error.stack
        })`
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
        { name: "missing_royalties", mod: ":json" },
        "normalized_value",
        "currency_normalized_value",
      ],
      {
        table: "orders",
      }
    );
    await idb.none(pgp.helpers.insert(orderValues, columns) + " ON CONFLICT DO NOTHING");

    await orderUpdatesByIdJob.addToQueue(
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
            } as OrderUpdatesByIdJobPayload)
        )
    );
  }

  return results;
};
