import { AddressZero } from "@ethersproject/constants";
import * as Sdk from "@reservoir0x/sdk";
import pLimit from "p-limit";

import { idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { bn, now, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import * as ordersUpdateById from "@/jobs/order-updates/by-id-queue";
import { Sources } from "@/models/sources";
import * as commonHelpers from "@/orderbook/orders/common/helpers";
import { DbOrder, OrderMetadata, generateSchemaHash } from "@/orderbook/orders/utils";
import { offChainCheck } from "@/orderbook/orders/blend/check";
import * as tokenSet from "@/orderbook/token-sets";

type SaveResult = {
  id: string;
  status: string;
  unfillable?: boolean;
  triggerKind?: "new-order" | "reprice";
};

// Listings

export type ListingOrderInfo = {
  orderParams: Sdk.Blend.Types.OrderParams;
  metadata: OrderMetadata;
};

export const save = async (
  orderInfos: ListingOrderInfo[],
  ingestMethod?: "websocket" | "rest"
): Promise<SaveResult[]> => {
  const results: SaveResult[] = [];
  const orderValues: DbOrder[] = [];

  const handleOrder = async ({ orderParams, metadata }: ListingOrderInfo) => {
    try {
      const order = new Sdk.Blend.Order(config.chainId, orderParams);
      const id = order.hash();

      if (!order.params.lien) {
        return results.push({
          id,
          status: "invalid-lien",
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

      // Handle: get order kind
      const kind = await commonHelpers.getContractKind(order.params.lien.collection!);
      if (!kind) {
        return results.push({
          id,
          status: "unknown-order-kind",
        });
      }

      const currentTime = now();
      const expirationTime = order.params.expirationTime;

      // Check: order is not expired
      if (currentTime >= Number(expirationTime)) {
        return results.push({
          id,
          status: "expired",
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
        await offChainCheck(order, {
          onChainApprovalRecheck: true,
          checkFilledOrCancelled: true,
        });
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
          id: `token:${order.params.lien.collection!}:${order.params.lien.tokenId!}`,
          schemaHash,
          contract: order.params.lien.collection!,
          tokenId: order.params.lien.tokenId.toString()!,
        },
      ]);

      if (!tokenSetId) {
        return results.push({
          id,
          status: "invalid-token-set",
        });
      }

      // Handle: price and value
      const price = bn(order.params.price);

      // Handle: source
      const sources = await Sources.getInstance();
      let source = await sources.getOrInsert("blur.io");
      if (metadata.source) {
        source = await sources.getOrInsert(metadata.source);
      }

      // Handle: native Reservoir orders
      const isReservoir = false;

      // Handle: fees
      const feeBps = order.params.fees.reduce((total, { rate }) => total + rate, 0);
      const feeBreakdown = order.params.fees.map(({ recipient, rate }) => ({
        kind: "royalty",
        recipient,
        bps: rate,
      }));

      // Handle: currency
      const currency = Sdk.Blur.Addresses.Beth[config.chainId];

      const validFrom = `date_trunc('seconds', now())`;
      const validTo = `date_trunc('seconds', to_timestamp(${expirationTime}))`;
      orderValues.push({
        id,
        kind: `blend`,
        side: "sell",
        fillability_status: fillabilityStatus,
        approval_status: approvalStatus,
        token_set_id: tokenSetId,
        token_set_schema_hash: toBuffer(schemaHash),
        maker: toBuffer(order.params.borrower),
        taker: toBuffer(AddressZero),
        price: price.toString(),
        value: price.toString(),
        currency: toBuffer(currency),
        currency_price: price.toString(),
        currency_value: price.toString(),
        needs_conversion: null,
        quantity_remaining: order.params.lien.amount.toString() ?? "1",
        valid_between: `tstzrange(${validFrom}, ${validTo}, '[]')`,
        nonce: order.params.nonce,
        source_id_int: source?.id,
        is_reservoir: isReservoir ? isReservoir : null,
        contract: toBuffer(order.params.lien.collection!),
        conduit: toBuffer(Sdk.Blur.Addresses.ExecutionDelegate[config.chainId]),
        fee_bps: feeBps,
        fee_breakdown: feeBreakdown || null,
        dynamic: null,
        raw_data: order.params,
        expiration: validTo,
        missing_royalties: null,
        normalized_value: null,
        currency_normalized_value: null,
        originated_at: metadata.originatedAt ?? null,
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
        "orders-blur-save",
        `Failed to handle listing with params ${JSON.stringify(orderParams)}: ${error}`
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
              ingestMethod,
            } as ordersUpdateById.OrderInfo)
        )
    );
  }

  return results;
};
