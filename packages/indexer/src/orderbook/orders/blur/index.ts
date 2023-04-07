import { AddressZero } from "@ethersproject/constants";
import { keccak256 } from "@ethersproject/solidity";
import { parseEther } from "@ethersproject/units";
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
import { offChainCheck } from "@/orderbook/orders/blur/check";
import * as tokenSet from "@/orderbook/token-sets";
// import { checkMarketplaceIsFiltered } from "@/utils/marketplace-blacklists";

type SaveResult = {
  id: string;
  status: string;
  unfillable?: boolean;
  triggerKind?: "new-order" | "reprice";
};

// Listings

export type ListingOrderInfo = {
  orderParams: Sdk.Blur.Types.BaseOrder;
  metadata: OrderMetadata;
};

export const saveListings = async (orderInfos: ListingOrderInfo[]): Promise<SaveResult[]> => {
  const results: SaveResult[] = [];
  const orderValues: DbOrder[] = [];

  const handleOrder = async ({ orderParams, metadata }: ListingOrderInfo) => {
    try {
      const order = new Sdk.Blur.Order(config.chainId, orderParams);
      const id = order.hash();

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

      // const isFiltered = await checkMarketplaceIsFiltered(order.params.collection, "blur");
      // if (isFiltered) {
      //   return results.push({
      //     id,
      //     status: "filtered",
      //   });
      // }

      const currentTime = now();
      const expirationTime = order.params.expirationTime;

      // Check: order is not expired
      if (currentTime >= Number(expirationTime)) {
        return results.push({
          id,
          status: "expired",
        });
      }

      // Check: order is not a bid
      if (order.params.side === Sdk.Blur.Types.TradeDirection.BUY) {
        return results.push({
          id,
          status: "unsupported-side",
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
        await offChainCheck(order, metadata.originatedAt, {
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
      const currency = order.params.paymentToken;

      const validFrom = `date_trunc('seconds', to_timestamp(${order.params.listingTime}))`;
      const validTo = `date_trunc('seconds', to_timestamp(${expirationTime}))`;
      orderValues.push({
        id,
        kind: `blur`,
        side: "sell",
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
            } as ordersUpdateById.OrderInfo)
        )
    );
  }

  return results;
};

// Bids

export type BidOrderInfo = {
  orderParams: Sdk.Blur.Types.BlurBidPool;
  metadata: OrderMetadata;
};

const getBlurBidId = (collection: string) =>
  // Buy orders have a single order id per collection
  keccak256(["string", "address"], ["blur", collection]);

export const saveBids = async (orderInfos: BidOrderInfo[]): Promise<SaveResult[]> => {
  const results: SaveResult[] = [];
  const orderValues: DbOrder[] = [];

  const handleOrder = async ({ orderParams }: BidOrderInfo) => {
    const id = getBlurBidId(orderParams.collection);

    // const isFiltered = await checkMarketplaceIsFiltered(orderParams.collection, "blur");
    // if (isFiltered) {
    //   return results.push({
    //     id,
    //     status: "filtered",
    //   });
    // }

    try {
      const orderResult = await idb.oneOrNone(
        `
          SELECT
            orders.raw_data
          FROM orders
          WHERE orders.id = $/id/
        `,
        { id }
      );
      if (!orderResult) {
        // Handle: token set
        const schemaHash = generateSchemaHash();
        const [{ id: tokenSetId }] = await tokenSet.contractWide.save([
          {
            id: `contract:${orderParams.collection}`.toLowerCase(),
            schemaHash,
            contract: orderParams.collection,
          },
        ]);
        if (!tokenSetId) {
          throw new Error("No token set available");
        }

        // Handle: source
        const sources = await Sources.getInstance();
        const source = await sources.getOrInsert("blur.io");

        // The price points should be kept sorted
        orderParams.pricePoints.sort((a, b) => Number(b.price) - Number(a.price));

        // Remove any empty price points
        orderParams.pricePoints = orderParams.pricePoints.filter((pp) => pp.executableSize > 0);

        if (!orderParams.pricePoints.length) {
          return results.push({
            id,
            status: "redundant",
          });
        }

        // Handle: price
        const price = parseEther(orderParams.pricePoints[0].price).toString();

        const totalQuantity = orderParams.pricePoints
          .map((p) => p.executableSize)
          .reduce((a, b) => a + b, 0);

        const validFrom = `date_trunc('seconds', now())`;
        const validTo = `'Infinity'`;
        orderValues.push({
          id,
          kind: "blur",
          side: "buy",
          fillability_status: "fillable",
          approval_status: "approved",
          token_set_id: tokenSetId,
          token_set_schema_hash: toBuffer(schemaHash),
          maker: toBuffer(Sdk.Blur.Addresses.Beth[config.chainId]),
          taker: toBuffer(AddressZero),
          price,
          value: price,
          currency: toBuffer(Sdk.Blur.Addresses.Beth[config.chainId]),
          currency_price: price,
          currency_value: price,
          needs_conversion: null,
          quantity_remaining: totalQuantity.toString(),
          valid_between: `tstzrange(${validFrom}, ${validTo}, '[]')`,
          nonce: null,
          source_id_int: source?.id,
          is_reservoir: null,
          contract: toBuffer(orderParams.collection),
          conduit: null,
          // TODO: Include royalty fees
          fee_bps: 0,
          fee_breakdown: null,
          dynamic: null,
          raw_data: orderParams,
          expiration: validTo,
          missing_royalties: null,
          normalized_value: null,
          currency_normalized_value: null,
          block_number: null,
          log_index: null,
        });

        results.push({
          id,
          status: "success",
        });
      } else {
        const currentBid = orderResult.raw_data as Sdk.Blur.Types.BlurBidPool;
        const bidUpdates = orderParams;

        if (currentBid.collection !== bidUpdates.collection) {
          return results.push({
            id,
            status: "unreachable",
          });
        }

        // Update the current bid in place
        for (const newPricePoint of bidUpdates.pricePoints) {
          const existingPricePointIndex = currentBid.pricePoints.findIndex(
            (pp) => pp.price === newPricePoint.price
          );
          if (existingPricePointIndex !== -1) {
            currentBid.pricePoints[existingPricePointIndex] = newPricePoint;
          } else {
            currentBid.pricePoints.push(newPricePoint);
          }
        }

        // The price points should be kept sorted
        currentBid.pricePoints.sort((a, b) => Number(b.price) - Number(a.price));

        // Remove any empty price points
        currentBid.pricePoints = currentBid.pricePoints.filter((pp) => pp.executableSize > 0);

        if (!currentBid.pricePoints.length) {
          await idb.none(
            `
              UPDATE orders SET
                fillability_status = 'filled',
                updated_at = now()
              WHERE orders.id = $/id/
            `,
            { id }
          );
        } else {
          // Handle: price
          const price = parseEther(currentBid.pricePoints[0].price).toString();

          const totalQuantity = currentBid.pricePoints
            .map((p) => p.executableSize)
            .reduce((a, b) => a + b, 0);

          await idb.none(
            `
              UPDATE orders SET
                fillability_status = 'fillable',
                price = $/price/,
                currency_price = $/price/,
                value = $/price/,
                currency_value = $/price/,
                quantity_remaining = $/totalQuantity/,
                valid_between = tstzrange(date_trunc('seconds', now()), 'Infinity', '[]'),
                expiration = 'Infinity',
                updated_at = now(),
                raw_data = $/rawData:json/
              WHERE orders.id = $/id/
            `,
            {
              id,
              price,
              totalQuantity,
              rawData: currentBid,
            }
          );
        }

        results.push({
          id,
          status: "success",
          triggerKind: "reprice",
        });
      }
    } catch (error) {
      logger.error(
        "orders-blur-save",
        `Failed to handle bid with params ${JSON.stringify(orderParams)}: ${error}`
      );
    }
  };

  // Process all orders concurrently
  const limit = pLimit(20);
  await Promise.all(orderInfos.map((orderInfo) => limit(() => handleOrder(orderInfo))));

  logger.info("orders-blur-save", JSON.stringify(results));

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
        .filter((r) => r.status === "success")
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
