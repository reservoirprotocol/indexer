import { AddressZero, HashZero } from "@ethersproject/constants";
import { keccak256 } from "@ethersproject/solidity";
import { parseEther } from "@ethersproject/units";
import * as Sdk from "@reservoir0x/sdk";
import pLimit from "p-limit";

import { idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { bn, fromBuffer, now, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import * as ordersUpdateById from "@/jobs/order-updates/by-id-queue";
import { Sources } from "@/models/sources";
import * as commonHelpers from "@/orderbook/orders/common/helpers";
import { DbOrder, OrderMetadata, generateSchemaHash } from "@/orderbook/orders/utils";
import { offChainCheck } from "@/orderbook/orders/blur/check";
import * as tokenSet from "@/orderbook/token-sets";
import { getBlurRoyalties } from "@/utils/blur";
import { checkMarketplaceIsFiltered } from "@/utils/marketplace-blacklists";

type SaveResult = {
  id: string;
  status: string;
  unfillable?: boolean;
  triggerKind?: "new-order" | "cancel" | "reprice";
};

// Listings (full)

export type FullListingOrderInfo = {
  orderParams: Sdk.Blur.Types.BaseOrder;
  metadata: OrderMetadata;
};

export const saveFullListings = async (
  orderInfos: FullListingOrderInfo[],
  ingestMethod?: "websocket" | "rest"
): Promise<SaveResult[]> => {
  const results: SaveResult[] = [];
  const orderValues: DbOrder[] = [];

  const handleOrder = async ({ orderParams, metadata }: FullListingOrderInfo) => {
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
        `Failed to handle full listing with params ${JSON.stringify(orderParams)}: ${error}`
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

// Listings (partial)

type PartialListingOrderParams = {
  collection: string;
  tokenId: string;
  owner?: string;
  // If empty then no Blur listing is available anymore
  price?: string;
  createdAt?: string;
};

export type PartialListingOrderInfo = {
  orderParams: PartialListingOrderParams;
  metadata: OrderMetadata;
};

const getBlurListingId = (orderParams: PartialListingOrderParams, owner: string) =>
  keccak256(
    ["string", "address", "address", "uint256", "uint256", "uint256"],
    [
      "blur",
      owner,
      orderParams.collection,
      orderParams.tokenId,
      parseEther(orderParams.price!),
      Math.floor(new Date(orderParams.createdAt!).getTime() / 1000),
    ]
  );

export const savePartialListings = async (
  orderInfos: PartialListingOrderInfo[],
  ingestMethod?: "websocket" | "rest"
): Promise<SaveResult[]> => {
  const results: SaveResult[] = [];
  const orderValues: DbOrder[] = [];

  const handleOrder = async ({ orderParams }: PartialListingOrderInfo) => {
    try {
      // Fetch current owner
      const owner = await idb
        .oneOrNone(
          `
            SELECT
              nft_balances.owner
            FROM nft_balances
            WHERE nft_balances.contract = $/contract/
              AND nft_balances.token_id = $/tokenId/
              AND nft_balances.amount > 0
            LIMIT 1
          `,
          {
            contract: toBuffer(orderParams.collection),
            tokenId: orderParams.tokenId,
          }
        )
        .then((r) => fromBuffer(r.owner));

      if (
        orderParams.owner &&
        orderParams.owner.toLowerCase() !== owner &&
        // Blend sell offers will have the original owner instead of the Blend contract
        owner !== Sdk.Blend.Addresses.Blend[config.chainId]
      ) {
        return results.push({
          id: "unknown",
          status: "redundant",
        });
      }

      // Handle: source
      const sources = await Sources.getInstance();
      const source = await sources.getOrInsert("blur.io");

      // Invalidate any old orders
      const anyActiveOrders = orderParams.price;
      const invalidatedOrderIds = await idb.manyOrNone(
        `
          UPDATE orders SET
            fillability_status = 'cancelled',
            expiration = now(),
            updated_at = now()
          WHERE orders.token_set_id = $/tokenSetId/
            AND orders.source_id_int = $/sourceId/
            AND orders.fillability_status = 'fillable'
            AND orders.raw_data->>'createdAt' IS NOT NULL
            AND orders.id != $/excludeOrderId/
            ${
              orderParams.createdAt
                ? ` AND (orders.raw_data->>'createdAt')::TIMESTAMPTZ <= $/createdAt/`
                : ""
            }
          RETURNING orders.id
        `,
        {
          tokenSetId: `token:${orderParams.collection}:${orderParams.tokenId}`,
          sourceId: source.id,
          excludeOrderId: anyActiveOrders ? getBlurListingId(orderParams, owner) : HashZero,
          createdAt: orderParams.createdAt,
        }
      );
      for (const { id } of invalidatedOrderIds) {
        results.push({
          id,
          status: "success",
          triggerKind: "cancel",
        });
      }

      if (!anyActiveOrders) {
        // No order is fillable, so we return early
        return results.push({
          id: HashZero,
          status: "no-active-orders",
        });
      }

      const id = getBlurListingId(orderParams, owner);

      // Handle: royalties
      let feeBps = 0;
      const feeBreakdown: { kind: string; recipient: string; bps: number }[] = [];
      const royalties = await getBlurRoyalties(orderParams.collection);
      if (royalties) {
        feeBreakdown.push({
          recipient: royalties.recipient,
          bps: royalties.minimumRoyaltyBps,
          kind: "royalty",
        });
        feeBps += feeBreakdown[0].bps;
      }

      // Handle: currency
      const currency = Sdk.Common.Addresses.Eth[config.chainId];

      // Handle: price
      const price = parseEther(orderParams.price!).toString();

      const validFrom = `'${orderParams.createdAt}'`;
      const validTo = `'Infinity'`;

      const orderResult = await idb.oneOrNone(
        `
          SELECT
            orders.id,
            orders.fillability_status
          FROM orders
          WHERE orders.id = $/id/
        `,
        { id }
      );
      if (!orderResult) {
        // Check and save: associated token set
        const schemaHash = generateSchemaHash();
        const [{ id: tokenSetId }] = await tokenSet.singleToken.save([
          {
            id: `token:${orderParams.collection}:${orderParams.tokenId}`,
            schemaHash,
            contract: orderParams.collection,
            tokenId: orderParams.tokenId,
          },
        ]);

        if (!tokenSetId) {
          return results.push({
            id,
            status: "invalid-token-set",
          });
        }

        // Handle: native Reservoir orders
        const isReservoir = false;

        orderValues.push({
          id,
          kind: "blur",
          side: "sell",
          fillability_status: "fillable",
          approval_status: "approved",
          token_set_id: tokenSetId,
          token_set_schema_hash: toBuffer(schemaHash),
          maker: toBuffer(owner),
          taker: toBuffer(AddressZero),
          price: price.toString(),
          value: price.toString(),
          currency: toBuffer(currency),
          currency_price: price.toString(),
          currency_value: price.toString(),
          needs_conversion: null,
          quantity_remaining: "1",
          valid_between: `tstzrange(${validFrom}, ${validTo}, '[]')`,
          nonce: null,
          source_id_int: source?.id,
          is_reservoir: isReservoir ? isReservoir : null,
          contract: toBuffer(orderParams.collection),
          conduit: null,
          fee_bps: feeBps,
          fee_breakdown: feeBreakdown || null,
          dynamic: null,
          raw_data: orderParams,
          expiration: validTo,
          missing_royalties: null,
          normalized_value: null,
          currency_normalized_value: null,
          originated_at: orderParams.createdAt ?? null,
        });

        results.push({
          id,
          status: "success",
          triggerKind: "new-order",
        });
      } else {
        // Order already exists
        const wasUpdated = await idb.oneOrNone(
          `
            UPDATE orders SET
              fillability_status = 'fillable',
              price = $/price/,
              currency_price = $/price/,
              value = $/price/,
              currency_value = $/price/,
              quantity_remaining = 1,
              valid_between = tstzrange('${orderParams.createdAt}', 'Infinity', '[]'),
              expiration = 'Infinity',
              updated_at = now(),
              raw_data = $/rawData:json/
            WHERE orders.id = $/id/
              AND orders.fillability_status != 'fillable'
              AND orders.approval_status = 'approved'
            RETURNING orders.id
          `,
          {
            id,
            price,
            rawData: orderParams,
          }
        );
        if (wasUpdated) {
          results.push({
            id,
            status: "success",
            triggerKind: "reprice",
          });
        }
      }
    } catch (error) {
      logger.error(
        "orders-blur-save",
        `Failed to handle partial listing with params ${JSON.stringify(orderParams)}: ${error}`
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
  }

  await ordersUpdateById.addToQueue(
    results
      .filter((r) => r.status === "success")
      .map(
        ({ id, triggerKind }) =>
          ({
            context: `${triggerKind}-${id}`,
            id,
            trigger: {
              kind: triggerKind,
            },
            ingestMethod,
          } as ordersUpdateById.OrderInfo)
      )
  );

  return results;
};

// Bids (partial)

export type PartialBidOrderInfo = {
  orderParams: Sdk.Blur.Types.BlurBidPool;
  metadata: OrderMetadata;
  fullUpdate?: boolean;
};

const getBlurBidId = (collection: string) =>
  // Buy orders have a single order id per collection
  keccak256(["string", "address"], ["blur", collection]);

export const savePartialBids = async (
  orderInfos: PartialBidOrderInfo[],
  ingestMethod?: "websocket" | "rest"
): Promise<SaveResult[]> => {
  const results: SaveResult[] = [];
  const orderValues: DbOrder[] = [];

  const handleOrder = async ({ orderParams, fullUpdate }: PartialBidOrderInfo) => {
    if (!fullUpdate && !orderParams.pricePoints.length) {
      return;
    }

    const id = getBlurBidId(orderParams.collection);
    const isFiltered = await checkMarketplaceIsFiltered(orderParams.collection, [
      Sdk.Blur.Addresses.ExecutionDelegate[config.chainId],
    ]);

    try {
      const royalties = await getBlurRoyalties(orderParams.collection);

      const orderResult = await idb.oneOrNone(
        `
          SELECT
            orders.raw_data,
            orders.fillability_status
          FROM orders
          WHERE orders.id = $/id/
        `,
        { id }
      );
      if (!orderResult) {
        if (isFiltered) {
          return results.push({
            id,
            status: "filtered",
          });
        }

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

        // Handle: royalties
        let feeBps = 0;
        const feeBreakdown: { kind: string; recipient: string; bps: number }[] = [];
        if (royalties) {
          feeBreakdown.push({
            recipient: royalties.recipient,
            bps: royalties.minimumRoyaltyBps,
            kind: "royalty",
          });
          feeBps += feeBreakdown[0].bps;
        }

        // Handle: price
        const price = parseEther(orderParams.pricePoints[0].price).toString();
        const value = bn(price).sub(bn(price).mul(feeBps).div(10000)).toString();

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
          value,
          currency: toBuffer(Sdk.Blur.Addresses.Beth[config.chainId]),
          currency_price: price,
          currency_value: value,
          needs_conversion: null,
          quantity_remaining: totalQuantity.toString(),
          valid_between: `tstzrange(${validFrom}, ${validTo}, '[]')`,
          nonce: null,
          source_id_int: source?.id,
          is_reservoir: null,
          contract: toBuffer(orderParams.collection),
          conduit: null,
          fee_bps: feeBps,
          fee_breakdown: feeBreakdown,
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
          triggerKind: "new-order",
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

        if (fullUpdate) {
          // Assume `JSON.stringify` is deterministic
          if (JSON.stringify(currentBid.pricePoints) === JSON.stringify(bidUpdates.pricePoints)) {
            return results.push({
              id,
              status: "redundant",
            });
          }

          currentBid.pricePoints = bidUpdates.pricePoints;
        } else {
          // Update the current bid in place
          for (const newPricePoint of bidUpdates.pricePoints) {
            const existingPricePointIndex = currentBid.pricePoints.findIndex(
              (pp) => Number(pp.price) === Number(newPricePoint.price)
            );
            if (existingPricePointIndex !== -1) {
              currentBid.pricePoints[existingPricePointIndex] = newPricePoint;
            } else {
              currentBid.pricePoints.push(newPricePoint);
            }
          }
        }

        // The price points should be kept sorted
        currentBid.pricePoints.sort((a, b) => Number(b.price) - Number(a.price));

        // Remove any empty price points
        currentBid.pricePoints = currentBid.pricePoints.filter((pp) => pp.executableSize > 0);

        if (!currentBid.pricePoints.length) {
          // Force empty price points
          currentBid.pricePoints = [];

          await idb.none(
            `
              UPDATE orders SET
                fillability_status = 'no-balance',
                raw_data = $/rawData/,
                expiration = now(),
                updated_at = now()
              WHERE orders.id = $/id/
            `,
            {
              id,
              rawData: currentBid,
            }
          );
        } else if (isFiltered) {
          if (orderResult.fillability_status === "fillable") {
            // Force empty price points
            currentBid.pricePoints = [];

            await idb.none(
              `
                UPDATE orders SET
                  fillability_status = 'no-balance',
                  raw_data = $/rawData/,
                  expiration = now(),
                  updated_at = now()
                WHERE orders.id = $/id/
              `,
              {
                id,
                rawData: currentBid,
              }
            );
          } else {
            return results.push({
              id,
              status: "filtered",
            });
          }
        } else {
          // Handle: royalties
          let feeBps = 0;
          const feeBreakdown: { kind: string; recipient: string; bps: number }[] = [];
          if (royalties) {
            feeBreakdown.push({
              recipient: royalties.recipient,
              bps: royalties.minimumRoyaltyBps,
              kind: "royalty",
            });
            feeBps += feeBreakdown[0].bps;
          }

          // Handle: price
          const price = parseEther(currentBid.pricePoints[0].price).toString();
          const value = bn(price).sub(bn(price).mul(feeBps).div(10000)).toString();

          const totalQuantity = currentBid.pricePoints
            .map((p) => p.executableSize)
            .reduce((a, b) => a + b, 0);

          await idb.none(
            `
              UPDATE orders SET
                fillability_status = 'fillable',
                price = $/price/,
                currency_price = $/price/,
                value = $/value/,
                currency_value = $/value/,
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
              value,
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
  }

  await ordersUpdateById.addToQueue(
    results
      .filter((r) => r.status === "success")
      .map(
        ({ id, triggerKind }) =>
          ({
            context: `${triggerKind}-${id}`,
            id,
            trigger: {
              kind: triggerKind,
            },
            ingestMethod,
          } as ordersUpdateById.OrderInfo)
      )
  );

  return results;
};
