import { AddressZero } from "@ethersproject/constants";
import * as Sdk from "@reservoir0x/sdk";
import { IV2OrderData, IV3OrderBuyData } from "@reservoir0x/sdk/dist/rarible/types";
import pLimit from "p-limit";

import { idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { bn, now, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { Sources } from "@/models/sources";
import { offChainCheck } from "@/orderbook/orders/rarible/check";
import { DbOrder, OrderMetadata, generateSchemaHash } from "@/orderbook/orders/utils";
import * as tokenSet from "@/orderbook/token-sets";
import * as royalties from "@/utils/royalties";
import {
  orderUpdatesByIdJob,
  OrderUpdatesByIdJobPayload,
} from "@/jobs/order-updates/order-updates-by-id-job";

export type OrderInfo = {
  orderParams: Sdk.Rarible.Types.Order;
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
      const order = new Sdk.Rarible.Order(config.chainId, orderParams);
      const id = order.hashOrderKey();

      const LAZY_ASSET_CLASSES = [
        Sdk.Rarible.Types.AssetClass.ERC721_LAZY.toString(),
        Sdk.Rarible.Types.AssetClass.ERC1155_LAZY.toString(),
      ];

      // Disable lazy orders
      if (
        LAZY_ASSET_CLASSES.includes(order.params.make.assetType.assetClass) ||
        LAZY_ASSET_CLASSES.includes(order.params.take.assetType.assetClass)
      ) {
        return results.push({
          id,
          status: "unsupported-asset-class",
        });
      }

      const { side } = order.getInfo()!;
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

      // Check: order has a valid listing time
      const listingTime = order.params.start;
      if (listingTime - 5 * 60 >= currentTime) {
        return results.push({
          id,
          status: "invalid-listing-time",
        });
      }

      // Check: order is not expired
      const expirationTime = order.params.end;
      if (currentTime >= expirationTime && expirationTime !== 0) {
        return results.push({
          id,
          status: "expired",
        });
      }

      const collection =
        side === "buy"
          ? order.params.take.assetType.contract!
          : order.params.make.assetType.contract!;

      const tokenId =
        side === "buy"
          ? order.params.take.assetType.tokenId!
          : order.params.make.assetType.tokenId!;
      const quantity = side === "buy" ? order.params.take.value : order.params.make.value;

      // Handle: currency
      let currency = "";
      if (side === "sell") {
        switch (order.params.take.assetType.assetClass) {
          case "ETH":
            currency = Sdk.Common.Addresses.Native[config.chainId];
            break;
          case "ERC20":
            currency = order.params.take.assetType.contract!;
            break;
          default:
            break;
        }
      } else {
        // This will always be WNative for now
        currency = order.params.make.assetType.contract!;
      }

      // Check: order has WNative or Native as payment token
      switch (side) {
        // Buy Order
        case "buy":
          if (currency !== Sdk.Common.Addresses.WNative[config.chainId]) {
            return results.push({
              id,
              status: "unsupported-payment-token",
            });
          }
          break;
        // Sell order
        case "sell":
          // We allow ETH and ERC20 orders so no need to validate here
          break;
        default:
          return results.push({
            id,
            status: "invalid-side",
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
        case "single-token": {
          [{ id: tokenSetId }] = await tokenSet.singleToken.save([
            {
              id: `token:${collection}:${tokenId}`,
              schemaHash,
              contract: collection,
              tokenId: tokenId,
            },
          ]);
          break;
        }

        case "contract-wide": {
          [{ id: tokenSetId }] = await tokenSet.contractWide.save([
            {
              id: `contract:${collection}`,
              schemaHash,
              contract: collection,
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

      // Handle: royalties
      const collectionRoyalties = await royalties.getRoyalties(collection, tokenId, "default");
      const feeBreakdown = collectionRoyalties.map(({ bps, recipient }) => ({
        kind: "royalty",
        recipient,
        bps,
      }));

      // Handle: order origin fees
      let originFees: { kind: string; recipient: string; bps: number }[] = [];
      switch (order.params.data.dataType) {
        case Sdk.Rarible.Constants.ORDER_DATA_TYPES.V1:
        case Sdk.Rarible.Constants.ORDER_DATA_TYPES.API_V1:
          break;

        case Sdk.Rarible.Constants.ORDER_DATA_TYPES.API_V2:
        case Sdk.Rarible.Constants.ORDER_DATA_TYPES.V2:
          originFees = [
            ...originFees,
            ...((order.params.data as IV2OrderData).originFees || []).map((split) => ({
              kind: "royalty",
              recipient: split.account,
              bps: Number(split.value),
            })),
          ];
          break;

        case Sdk.Rarible.Constants.ORDER_DATA_TYPES.V3_BUY:
        case Sdk.Rarible.Constants.ORDER_DATA_TYPES.V3_SELL:
        case Sdk.Rarible.Constants.ORDER_DATA_TYPES.API_V3_BUY:
        case Sdk.Rarible.Constants.ORDER_DATA_TYPES.API_V3_SELL:
          if ((order.params.data as IV3OrderBuyData).originFeeFirst) {
            const originFeeFirst = (order.params.data as IV3OrderBuyData).originFeeFirst;
            originFees = [
              ...originFees,
              {
                kind: "royalty",
                recipient: originFeeFirst.account,
                bps: Number(originFeeFirst.value),
              },
            ];
          }

          if ((order.params.data as IV3OrderBuyData).originFeeSecond) {
            const originFeeSecond = (order.params.data as IV3OrderBuyData).originFeeSecond;
            originFees = [
              ...originFees,
              {
                kind: "royalty",
                recipient: originFeeSecond.account,
                bps: Number(originFeeSecond.value),
              },
            ];
          }

          break;

        default:
          break;
      }

      const feeBps = feeBreakdown.map(({ bps }) => bps).reduce((a, b) => Number(a) + Number(b), 0);

      // Handle: price and value
      let price = side === "buy" ? order.params.make.value : order.params.take.value;
      price = bn(price).div(quantity).toString();

      // For sell orders, the value is the same as the price
      let value = price;
      // For orders, we set the value as `price - fee` since it
      // is best for UX to show the user exactly what they're going
      // to receive on offer acceptance.
      const collectionFeeBps = collectionRoyalties
        .map(({ bps }) => bps)
        .reduce((a, b) => Number(a) + Number(b), 0);
      if (collectionFeeBps && side === "buy") {
        value = bn(value)
          .sub(bn(value).mul(bn(collectionFeeBps)).div(10000))
          .toString();
      }

      const originFeesBps = originFees
        .map(({ bps }) => bps)
        .reduce((a, b) => Number(a) + Number(b), 0);

      // Origin fees are added on top of the bid price
      if (originFeesBps && side === "buy") {
        price = bn(price)
          .add(bn(price).mul(bn(originFeesBps)).div(10000))
          .toString();
      }

      // Handle: source
      const sources = await Sources.getInstance();
      let source = await sources.getOrInsert("rarible.com");
      if (metadata.source) {
        source = await sources.getOrInsert(metadata.source);
      }

      // Handle: native Reservoir orders
      const isReservoir = false;

      // Handle: conduit
      let conduit = "";
      switch (side) {
        case "buy":
          conduit = Sdk.Rarible.Addresses.ERC20TransferProxy[config.chainId];
          break;
        case "sell":
          conduit = Sdk.Rarible.Addresses.NFTTransferProxy[config.chainId];
          break;
        default:
          return results.push({
            id,
            status: "invalid-order-side",
          });
      }

      const validFrom = `date_trunc('seconds', to_timestamp(${order.params.start}))`;
      const validTo = order.params.end
        ? `date_trunc('seconds', to_timestamp(${order.params.end}))`
        : "'infinity'";
      orderValues.push({
        id,
        kind: "rarible",
        side,
        fillability_status: fillabilityStatus,
        approval_status: approvalStatus,
        token_set_id: tokenSetId,
        token_set_schema_hash: toBuffer(schemaHash),
        maker: toBuffer(order.params.maker),
        taker: toBuffer(AddressZero),
        price,
        value,
        quantity_remaining: quantity ?? "1",
        currency: toBuffer(currency),
        currency_price: price,
        currency_value: value,
        needs_conversion: null,
        valid_between: `tstzrange(${validFrom}, ${validTo}, '[]')`,
        // The salt is hexed when coming from Rarible's API
        nonce: bn(order.params.salt).toString(),
        source_id_int: source?.id,
        is_reservoir: isReservoir ? isReservoir : null,
        contract: toBuffer(collection),
        conduit: toBuffer(conduit),
        fee_bps: feeBps,
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
        "orders-rarible-save",
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
        "quantity_remaining",
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
