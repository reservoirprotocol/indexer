import { Interface } from "@ethersproject/abi";
import { BigNumber } from "@ethersproject/bignumber";
import { AddressZero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import { keccak256 } from "@ethersproject/solidity";
import * as Sdk from "@reservoir0x/sdk";
import pLimit from "p-limit";

import { idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { bn, now, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import * as ordersUpdateById from "@/jobs/order-updates/by-id-queue";
import { Sources } from "@/models/sources";
import { offChainCheck } from "@/orderbook/orders/payment-processor/check";
import { DbOrder, OrderMetadata, generateSchemaHash } from "@/orderbook/orders/utils";
import * as tokenSet from "@/orderbook/token-sets";
import * as royalties from "@/utils/royalties";
import _ from "lodash";

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
      const order = new Sdk.PaymentProcessor.Order(config.chainId, orderParams);
      const id = order.hash();

      // For now, only listings are supported
      if (order.params.kind !== "sale-approval") {
        return results.push({
          id,
          status: "unsupported-side",
        });
      }

      // For now, only single amounts are supported
      if (order.params.amount !== "1") {
        return results.push({
          id,
          status: "unsupported-amount",
        });
      }

      const exchange = new Contract(
        Sdk.PaymentProcessor.Addresses.Exchange[config.chainId],
        new Interface([
          "function getTokenSecurityPolicyId(address collectionAddress) public view returns (uint256)",
        ]),
        baseProvider
      );
      const securityId = await exchange.getTokenSecurityPolicyId(order.params.tokenAddress);

      // For now, only the default security policy is supported
      if (securityId.toString() != "0") {
        return results.push({
          id,
          status: "unsupported-security-policy",
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

      // Check: order has ETH as payment token
      if (![Sdk.Common.Addresses.Eth[config.chainId]].includes(order.params.coin)) {
        return results.push({
          id,
          status: "unsupported-payment-token",
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
      }

      if (!tokenSetId) {
        return results.push({
          id,
          status: "invalid-token-set",
        });
      }

      const side = ["sale-approval"].includes(order.params.kind) ? "sell" : "buy";

      // Handle: currency
      const currency = order.params.coin;

      // Handle: fees
      const feeBreakdown: {
        kind: string;
        recipient: string;
        bps: number;
      }[] = (
        side === "sell"
          ? await royalties.getRoyalties(
              order.params.tokenAddress,
              order.params.tokenId,
              "on-chain"
            )
          : await royalties.getRoyaltiesByTokenSet(tokenSetId, "on-chain")
      ).map((r) => ({ kind: "royalty", ...r }));

      const price = bn(order.params.price).div(order.params.amount).toString();

      // Handle: royalties on top
      const defaultRoyalties =
        side === "sell"
          ? await royalties.getRoyalties(order.params.tokenAddress, order.params.tokenId, "default")
          : await royalties.getRoyaltiesByTokenSet(tokenSetId, "default");

      const totalBuiltInBps = feeBreakdown
        .map(({ bps, kind }) => (kind === "royalty" ? bps : 0))
        .reduce((a, b) => a + b, 0);
      const totalDefaultBps = defaultRoyalties.map(({ bps }) => bps).reduce((a, b) => a + b, 0);

      const missingRoyalties = [];
      let missingRoyaltyAmount = bn(0);
      if (totalBuiltInBps < totalDefaultBps) {
        const validRecipients = defaultRoyalties.filter(
          ({ bps, recipient }) => bps && recipient !== AddressZero
        );
        if (validRecipients.length) {
          const bpsDiff = totalDefaultBps - totalBuiltInBps;
          const amount = bn(price).mul(bpsDiff).div(10000);
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
      let value: string;
      let normalizedValue: string | undefined;
      if (side === "buy") {
        // For buy orders, we set the value as `price - fee` since it
        // is best for UX to show the user exactly what they're going
        // to receive on offer acceptance.
        value = bn(price)
          .sub(bn(price).mul(bn(feeBps)).div(10000))
          .toString();
        // The normalized value excludes the royalties from the value
        normalizedValue = bn(value).sub(missingRoyaltyAmount).toString();
      } else {
        // For sell orders, the value is the same as the price
        value = price;
        // The normalized value includes the royalties on top of the price
        normalizedValue = bn(value).add(missingRoyaltyAmount).toString();
      }

      // Handle: source
      const sources = await Sources.getInstance();
      let source = await sources.getOrInsert("limitbreak.com");
      if (metadata.source) {
        source = await sources.getOrInsert(metadata.source);
      }

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
        currency_price: price,
        currency_value: value,
        needs_conversion: null,
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
        currency_normalized_value: normalizedValue,
      });

      const unfillable =
        fillabilityStatus !== "fillable" || approvalStatus !== "approved" ? true : undefined;

      results.push({
        id,
        status: "success",
        unfillable,
      });
    } catch (error) {
      logger.error(
        "payment-processor",
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
  }

  return results;
};
