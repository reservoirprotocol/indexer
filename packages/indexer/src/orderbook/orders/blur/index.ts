import { AddressZero, HashZero } from "@ethersproject/constants";
import { keccak256 } from "@ethersproject/solidity";
import { parseEther } from "@ethersproject/units";
import * as Sdk from "@reservoir0x/sdk";
import pLimit from "p-limit";

import { idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { bn, fromBuffer, regex, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { Sources } from "@/models/sources";
import { DbOrder, OrderMetadata, generateSchemaHash } from "@/orderbook/orders/utils";
import * as tokenSet from "@/orderbook/token-sets";
import { getBlurRoyalties } from "@/utils/blur";
import { checkMarketplaceIsFiltered } from "@/utils/marketplace-blacklists";
import {
  orderUpdatesByIdJob,
  OrderUpdatesByIdJobPayload,
} from "@/jobs/order-updates/order-updates-by-id-job";

type SaveResult = {
  id: string;
  status: string;
  unfillable?: boolean;
  triggerKind?: "new-order" | "reprice" | "revalidation";
};

// Listings (partial)

type PartialListingOrderParams = {
  collection: string;
  tokenId: string;
  owner?: string;
  // If empty then no Blur listing is available anymore
  price?: string;
  createdAt?: string;
  // Additional metadata
  fromWebsocket?: boolean;
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
      if (!orderParams.collection.match(regex.address)) {
        return;
      }

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

      const isFiltered = await checkMarketplaceIsFiltered(orderParams.collection, [
        Sdk.BlurV2.Addresses.Delegate[config.chainId],
      ]);
      if (isFiltered) {
        // Force remove any orders
        orderParams.price = undefined;
      }

      // Check if there is any transfer after the order's `createdAt`.
      // If yes, then we treat the order as an `invalidation` message.
      if (orderParams.createdAt) {
        const existsNewerTransfer = await idb.oneOrNone(
          `
            SELECT
              1
            FROM nft_transfer_events
            WHERE address = $/contract/
              AND token_id = $/tokenId/
              AND timestamp > $/createdAt/
            LIMIT 1
          `,
          {
            contract: toBuffer(orderParams.collection),
            tokenId: orderParams.tokenId,
            createdAt: Math.floor(new Date(orderParams.createdAt).getTime() / 1000),
          }
        );
        if (existsNewerTransfer) {
          // Force remove any older orders
          orderParams.price = undefined;
        }
      }

      // Invalidate any old orders
      const anyActiveOrders = orderParams.price;
      const invalidatedOrderIds = await idb.manyOrNone(
        `
          UPDATE orders SET
            approval_status = 'disabled',
            expiration = now(),
            updated_at = now()
          WHERE orders.token_set_id = $/tokenSetId/
            AND orders.fillability_status = 'fillable'
            AND orders.approval_status = 'approved'
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
          triggerKind: "revalidation",
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
      if (isFiltered) {
        return results.push({
          id,
          status: "filtered",
        });
      }

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
      const currency = Sdk.Common.Addresses.Native[config.chainId];

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
          maker: toBuffer((orderParams.owner ?? owner).toLowerCase()),
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

        if (!orderParams.fromWebsocket) {
          logger.info("blur-debug", JSON.stringify(orderParams));
        }
      } else {
        // Order already exists
        const wasUpdated = await idb.oneOrNone(
          `
            UPDATE orders SET
              fillability_status = 'fillable',
              approval_status = 'approved',
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
              AND (orders.fillability_status != 'fillable' OR orders.approval_status != 'approved')
              AND (orders.fillability_status != 'cancelled' OR orders.approval_status != 'disabled')
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
            triggerKind: "revalidation",
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
        "originated_at",
      ],
      {
        table: "orders",
      }
    );
    await idb.none(pgp.helpers.insert(orderValues, columns) + " ON CONFLICT DO NOTHING");
  }

  await orderUpdatesByIdJob.addToQueue(
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
          } as OrderUpdatesByIdJobPayload)
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
    if (!orderParams.collection.match(regex.address)) {
      return;
    }

    if (!fullUpdate && !orderParams.pricePoints.length) {
      return;
    }

    const id = getBlurBidId(orderParams.collection);
    const isFiltered = await checkMarketplaceIsFiltered(orderParams.collection, [
      Sdk.BlurV2.Addresses.Delegate[config.chainId],
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
        let skipSaveResult = false;

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

          const { rowCount } = await idb.result(
            `
              UPDATE orders SET
                fillability_status = 'fillable',
                price = $/price/,
                currency_price = $/price/,
                normalized_value = null,
                currency_normalized_value = null,
                missing_royalties = null,
                value = $/value/,
                currency_value = $/value/,
                quantity_remaining = $/totalQuantity/,
                valid_between = tstzrange(date_trunc('seconds', now()), 'Infinity', '[]'),
                expiration = 'Infinity',
                updated_at = now(),
                raw_data = $/rawData:json/
              WHERE orders.id = $/id/
              AND (
                fillability_status != 'fillable'
                OR price IS DISTINCT FROM $/price/ 
                OR currency_price IS DISTINCT FROM $/price/
                OR value IS DISTINCT FROM $/value/
                OR currency_value IS DISTINCT FROM $/value/
                OR quantity_remaining IS DISTINCT FROM $/totalQuantity/
                OR raw_data IS DISTINCT FROM $/rawData:json/
              )
            `,
            {
              id,
              price,
              value,
              totalQuantity,
              rawData: currentBid,
            }
          );

          skipSaveResult = rowCount === 0;
        }

        if (skipSaveResult) {
          // logger.info("orders-blur-save", `Skip reprice event. ${JSON.stringify(orderParams)}`);
        } else {
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

  await orderUpdatesByIdJob.addToQueue(
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
          } as OrderUpdatesByIdJobPayload)
      )
  );

  return results;
};
