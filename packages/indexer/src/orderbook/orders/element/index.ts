import { defaultAbiCoder } from "@ethersproject/abi";
import { AddressZero } from "@ethersproject/constants";
import { keccak256 } from "@ethersproject/keccak256";
import * as Sdk from "@reservoir0x/sdk";
import pLimit from "p-limit";

import { idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { bn, now, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { Sources } from "@/models/sources";
import * as commonHelpers from "@/orderbook/orders/common/helpers";
import { DbOrder, OrderMetadata, generateSchemaHash } from "@/orderbook/orders/utils";
import { offChainCheck } from "@/orderbook/orders/element/check";
import * as tokenSet from "@/orderbook/token-sets";
import {
  orderUpdatesByIdJob,
  OrderUpdatesByIdJobPayload,
} from "@/jobs/order-updates/order-updates-by-id-job";

export type OrderInfo = {
  orderParams: Sdk.Element.Types.BaseOrder | Sdk.Element.Types.BatchSignedOrder;
  metadata: OrderMetadata;
};

type SaveResult = {
  id: string;
  status: string;
  unfillable?: boolean;
};

export const save = async (orderInfos: OrderInfo[]): Promise<SaveResult[]> => {
  const results: SaveResult[] = [];
  const orderValues: DbOrder[] = [];

  const handleOrder = async ({ orderParams, metadata }: OrderInfo) => {
    try {
      const order = new Sdk.Element.Order(config.chainId, orderParams);
      const id = keccak256(
        defaultAbiCoder.encode(["bytes32", "uint256"], [order.hash(), order.params.nonce])
      );

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

      // Handle: get order kind
      const kind = await commonHelpers.getContractKind(order.params.nft!);
      if (!kind) {
        return results.push({
          id,
          status: "unknown-order-kind",
        });
      }

      const currentTime = now();

      // Check: order has a valid listing time
      const listingTime = order.listingTime();
      if (listingTime >= currentTime + 5 * 60) {
        return results.push({
          id,
          status: "invalid-listing-time",
        });
      }

      // Check: order is not expired
      const expirationTime = order.expirationTime();
      if (currentTime >= expirationTime) {
        return results.push({
          id,
          status: "expired",
        });
      }

      // Check: buy order has WNative as payment token
      const side = order.side() === "buy" ? "buy" : "sell";
      if (side === "buy" && order.erc20Token() !== Sdk.Common.Addresses.WNative[config.chainId]) {
        return results.push({
          id,
          status: "unsupported-payment-token",
        });
      }

      // Check: sell order has Eth as payment token
      if (side === "sell" && order.erc20Token() !== Sdk.Common.Addresses.Native[config.chainId]) {
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

      const info = order.getInfo();
      if (!info) {
        return results.push({
          id,
          status: "unknown-info",
        });
      }

      switch (order.orderKind()) {
        case "contract-wide": {
          if (side === "sell") {
            break;
          }

          [{ id: tokenSetId }] = await tokenSet.contractWide.save([
            {
              id: `contract:${order.params.nft}`,
              schemaHash,
              contract: order.params.nft!,
            },
          ]);

          break;
        }

        case "single-token": {
          [{ id: tokenSetId }] = await tokenSet.singleToken.save([
            {
              id: `token:${order.params.nft}:${order.params.nftId}`,
              schemaHash,
              contract: order.params.nft!,
              tokenId: order.params.nftId!,
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

      // Handle: fees
      const feeAmount = order.getFeeAmount();

      // Handle: price and value
      let price = order.getTotalPrice();
      let value = price;
      if (side === "buy") {
        // For buy orders, we set the value as `price - fee` since it
        // is best for UX to show the user exactly what they're going
        // to receive on offer acceptance.
        value = bn(price).sub(feeAmount);
      }

      // The price and value are for a single item
      let nftAmount = "1";
      if (order.contractKind() === "erc1155") {
        nftAmount = (order.params as Sdk.Element.Types.BaseOrder).nftAmount!;
        price = price.div(nftAmount);
        value = value.div(nftAmount);
      }

      const feeBps = price.eq(0) ? bn(0) : feeAmount.mul(10000).div(price);
      if (feeBps.gt(10000)) {
        return results.push({
          id,
          status: "fees-too-high",
        });
      }

      // Handle: source
      const sources = await Sources.getInstance();
      let source = await sources.getOrInsert("element.market");
      if (metadata.source) {
        source = await sources.getOrInsert(metadata.source);
      }

      // Handle: native Reservoir orders
      const isReservoir = false;

      // Handle: fee breakdown
      let taker;
      let feeBreakdown;
      if (order.isBatchSignedOrder()) {
        taker = AddressZero;
        const params = order.params as Sdk.Element.Types.BatchSignedOrder;
        feeBreakdown = [
          ...(params.platformFee
            ? [
                {
                  kind: "marketplace",
                  recipient: params.platformFeeRecipient,
                  bps: params.platformFee,
                },
              ]
            : []),
          ...(params.royaltyFee
            ? [
                {
                  kind: "royalty",
                  recipient: params.royaltyFeeRecipient,
                  bps: params.royaltyFee,
                },
              ]
            : []),
        ];
      } else {
        const params = order.params as Sdk.Element.Types.BaseOrder;
        taker = params.taker;
        feeBreakdown = params.fees.map(({ recipient, amount }, index) => ({
          kind: index === 0 ? "marketplace" : "royalty",
          recipient,
          bps: price.eq(0) ? bn(0) : bn(amount).mul(10000).div(price).toNumber(),
        }));
      }

      const validFrom = `date_trunc('seconds', to_timestamp(${listingTime}))`;
      const validTo = `date_trunc('seconds', to_timestamp(${expirationTime}))`;
      orderValues.push({
        id,
        kind: kind === "erc1155" ? "element-erc1155" : "element-erc721",
        side,
        fillability_status: fillabilityStatus,
        approval_status: approvalStatus,
        token_set_id: tokenSetId,
        token_set_schema_hash: toBuffer(schemaHash),
        maker: toBuffer(order.params.maker),
        taker: toBuffer(taker),
        price: price.toString(),
        value: value.toString(),
        currency: toBuffer(order.erc20Token()),
        currency_price: price.toString(),
        currency_value: value.toString(),
        needs_conversion: null,
        quantity_remaining: nftAmount,
        valid_between: `tstzrange(${validFrom}, ${validTo}, '[]')`,
        nonce: order.params.nonce.toString(),
        source_id_int: source?.id,
        is_reservoir: isReservoir ? isReservoir : null,
        contract: toBuffer(order.params.nft!),
        conduit: toBuffer(Sdk.Element.Addresses.Exchange[config.chainId]),
        fee_bps: feeBps.toNumber(),
        fee_breakdown: feeBreakdown || null,
        dynamic: null,
        raw_data: order.params,
        expiration: validTo,
        missing_royalties: null,
        normalized_value: null,
        currency_normalized_value: null,
        originated_at: metadata.originatedAt || null,
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
        "orders-element-save",
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
        "conduit",
        "fee_bps",
        { name: "fee_breakdown", mod: ":json" },
        "dynamic",
        "raw_data",
        { name: "expiration", mod: ":raw" },
        "originated_at",
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
