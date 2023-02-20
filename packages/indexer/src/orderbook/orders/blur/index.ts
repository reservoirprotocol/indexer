import * as Sdk from "@reservoir0x/sdk";
import pLimit from "p-limit";

import { idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { bn, now, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import * as arweaveRelay from "@/jobs/arweave-relay";
import * as ordersUpdateById from "@/jobs/order-updates/by-id-queue";
import * as commonHelpers from "@/orderbook/orders/common/helpers";
import { DbOrder, OrderMetadata, generateSchemaHash } from "@/orderbook/orders/utils";
import { offChainCheck } from "@/orderbook/orders/blur/check";
import * as tokenSet from "@/orderbook/token-sets";
import { Sources } from "@/models/sources";
import { AddressZero } from "@ethersproject/constants";

export type OrderInfo = {
  orderParams: Sdk.Blur.Types.BaseOrder;
  metadata: OrderMetadata;
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
    order: Sdk.Blur.Order;
    schemaHash?: string;
    source?: string;
  }[] = [];

  const handleOrder = async ({ orderParams, metadata }: OrderInfo) => {
    try {
      const order = new Sdk.Blur.Order(config.chainId, orderParams);
      const id = order.hash();

      const expirationTime = order.params.expirationTime;

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
      const kind = await commonHelpers.getContractKind(order.params.collection);
      if (!kind) {
        return results.push({
          id,
          status: "unknown-order-kind",
        });
      }

      const currentTime = now();

      // Check: order is not expired
      if (currentTime >= Number(expirationTime)) {
        return results.push({
          id,
          status: "expired",
        });
      }

      // Check: buy order has Weth as payment token
      if (
        order.params.side === Sdk.Blur.Types.TradeDirection.BUY &&
        order.params.paymentToken !== Sdk.Common.Addresses.Weth[config.chainId]
      ) {
        return results.push({
          id,
          status: "unsupported-payment-token",
        });
      }

      // Check: sell order has Eth as payment token
      if (
        order.params.side === Sdk.Blur.Types.TradeDirection.SELL &&
        order.params.paymentToken !== Sdk.Common.Addresses.Eth[config.chainId]
      ) {
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
      const schemaHash = metadata.schemaHash ?? generateSchemaHash(metadata.schema);

      const [{ id: tokenSetId }] = await tokenSet.singleToken.save([
        {
          id: `token:${order.params.collection}:${order.params.tokenId}`,
          schemaHash,
          contract: order.params.collection,
          tokenId: order.params.tokenId,
        },
      ]);

      if (!tokenSetId) {
        return results.push({
          id,
          status: "invalid-token-set",
        });
      }

      // Handle: fees
      const side = order.params.side === Sdk.Blur.Types.TradeDirection.BUY ? "buy" : "sell";

      // Handle: price and value
      const price = bn(order.params.price);

      // Handle: source
      const sources = await Sources.getInstance();
      const source = metadata.source ? await sources.getOrInsert(metadata.source) : undefined;

      // Handle: native Reservoir orders
      const isReservoir = false;

      const feeBps = order.params.fees.reduce((total, { rate }) => total + rate, 0);

      // Handle: fee breakdown
      const feeBreakdown = order.params.fees.map(({ recipient, rate }) => ({
        kind: "royalty",
        recipient,
        bps: rate,
      }));

      // Handle: currency
      const currency = order.params.paymentToken;

      const validFrom = `date_trunc('seconds', to_timestamp(0))`;
      const validTo = `date_trunc('seconds', to_timestamp(${expirationTime}))`;
      orderValues.push({
        id,
        kind: `blur`,
        side,
        fillability_status: fillabilityStatus,
        approval_status: approvalStatus,
        token_set_id: tokenSetId,
        token_set_schema_hash: toBuffer(schemaHash),
        maker: toBuffer(order.params.trader),
        taker: toBuffer(AddressZero),
        price: price.toString(),
        value: price.toString(),
        currency: toBuffer(currency),
        currency_price: price.toString(),
        currency_value: price.toString(),
        needs_conversion: null,
        quantity_remaining: order.params.amount ?? "1",
        valid_between: `tstzrange(${validFrom}, ${validTo}, '[]')`,
        nonce: order.params.nonce,
        source_id_int: source?.id,
        is_reservoir: isReservoir ? isReservoir : null,
        contract: toBuffer(order.params.collection),
        conduit: toBuffer(Sdk.Blur.Addresses.ExecutionDelegate[config.chainId]),
        fee_bps: feeBps,
        fee_breakdown: feeBreakdown || null,
        dynamic: null,
        raw_data: order.params,
        expiration: validTo,
        missing_royalties: null,
        normalized_value: null,
        currency_normalized_value: null,
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
      logger.error(
        "orders-blur-save",
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
      await arweaveRelay.addPendingOrdersBlur(arweaveData);
    }
  }

  return results;
};
