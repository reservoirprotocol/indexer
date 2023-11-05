import * as Sdk from "@reservoir0x/sdk";
import pLimit from "p-limit";

import { idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { bn, now, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { Sources } from "@/models/sources";
import { DbOrder, OrderMetadata, generateSchemaHash } from "@/orderbook/orders/utils";
import { offChainCheck } from "@/orderbook/orders/hotpot/check";
import * as commonHelpers from "@/orderbook/orders/common/helpers";
import * as tokenSet from "@/orderbook/token-sets";
import * as royalties from "@/utils/royalties";
import {
  orderUpdatesByIdJob,
  OrderUpdatesByIdJobPayload,
} from "@/jobs/order-updates/order-updates-by-id-job";
import { OfferTokenType } from "@reservoir0x/sdk/src/hotpot/types";
import { checkMarketplaceIsFiltered } from "@/utils/marketplace-blacklists";

export type OrderInfo = {
  orderParams: Sdk.Hotpot.Types.OrderParameters;
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
      const order = new Sdk.Hotpot.Order(config.chainId, orderParams);
      const id = order.hash();

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

      // Handle: get order kind
      const kind = await commonHelpers.getContractKind(order.params.offerItem.offerToken);
      if (!kind) {
        return results.push({
          id,
          status: "unknown-order-kind",
        });
      }

      const isFiltered = await checkMarketplaceIsFiltered(orderParams.offerItem.offerToken, [
        Sdk.Hotpot.Addresses.Exchange[config.chainId],
      ]);

      if (isFiltered) {
        return results.push({
          id,
          status: "filtered",
        });
      }

      const currentTime = now();

      // Check: order is not expired
      const expirationTime = order.params.offerItem.endTime;
      if (currentTime >= expirationTime) {
        return results.push({
          id,
          status: "expired",
        });
      }

      // Check: sell order has Eth as payment token
      if (order.params.currency !== Sdk.Common.Addresses.Native[config.chainId]) {
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
        order.checkOrderSignature();
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
        case "single-token": {
          [{ id: tokenSetId }] = await tokenSet.singleToken.save([
            {
              id: `token:${order.params.offerItem.offerToken}:${order.params.offerItem.offerTokenId}`,
              schemaHash,
              contract: order.params.offerItem.offerToken,
              tokenId: order.params.offerItem.offerTokenId,
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

      const side = "sell";
      // Handle: currency
      const currency = "ETH";

      // Handle: royalties on top
      const defaultRoyalties = await royalties.getRoyalties(
        order.params.offerItem.offerToken,
        order.params.offerItem.offerTokenId,
        "default"
      );

      // The price and value are for a single item
      let price = bn(order.params.offerItem.offerAmount);
      let nftAmount = "1";
      if (order.params.tokenType === OfferTokenType.ERC1155) {
        nftAmount = order.params.offerItem.amount.toString();
        price = price.div(nftAmount);
      }

      const missingRoyalties = [];
      let missingRoyaltyAmount = bn(0);
      for (const { bps, recipient } of defaultRoyalties) {
        const amount = bn(price).mul(bps).div(10000).toString();
        missingRoyaltyAmount = missingRoyaltyAmount.add(amount);

        missingRoyalties.push({
          bps,
          amount,
          recipient,
        });
      }

      // Handle: price and value
      const value = price;
      // The normalized value includes the royalties on top of the price
      const normalizedValue = value.add(missingRoyaltyAmount).toString();

      // For sell orders, the value is the same as the price

      // Handle: source
      const sources = await Sources.getInstance();
      let source = await sources.getOrInsert("market.hotpot.gg");
      if (metadata.source) {
        source = await sources.getOrInsert(metadata.source);
      }

      // Handle: native Reservoir orders
      const isReservoir = false;

      // Handle: conduit
      const conduit = Sdk.Hotpot.Addresses.Exchange[config.chainId];

      const validFrom = `date_trunc('seconds', to_timestamp(${currentTime}))`;
      const validTo = `date_trunc('seconds', to_timestamp(${order.params.offerItem.endTime}))`;
      const price_s = price.toString();
      const value_s = value.toString();
      orderValues.push({
        id,
        kind: "hotpot",
        side,
        fillability_status: fillabilityStatus,
        approval_status: approvalStatus,
        token_set_id: tokenSetId,
        token_set_schema_hash: toBuffer(schemaHash),
        maker: toBuffer(order.params.offerer),
        taker: toBuffer(order.params.receiver!),
        price: price_s,
        value: value_s,
        currency: toBuffer(currency),
        quantity_remaining: nftAmount,
        currency_price: price_s,
        currency_value: value_s,
        needs_conversion: null,
        valid_between: `tstzrange(${validFrom}, ${validTo}, '[]')`,
        nonce: order.params.salt.toString(),
        source_id_int: source?.id,
        is_reservoir: isReservoir ? isReservoir : null,
        contract: toBuffer(order.params.offerItem.offerToken),
        conduit: toBuffer(conduit),
        fee_bps: 0,
        fee_breakdown: null,
        dynamic: null,
        raw_data: order.params,
        expiration: validTo,
        missing_royalties: missingRoyalties,
        normalized_value: normalizedValue,
        currency_normalized_value: normalizedValue,
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
        "orders-hotpot-save",
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
