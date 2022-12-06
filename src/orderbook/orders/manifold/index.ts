import { AddressZero } from "@ethersproject/constants";
import { keccak256 } from "@ethersproject/solidity";
import * as Sdk from "@reservoir0x/sdk";
import pLimit from "p-limit";

import { idb, redb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import * as ordersUpdateById from "@/jobs/order-updates/by-id-queue";
import { Sources } from "@/models/sources";
import { offChainCheck } from "@/orderbook/orders/manifold/check";
import { DbOrder, OrderMetadata, generateSchemaHash } from "@/orderbook/orders/utils";
import * as tokenSet from "@/orderbook/token-sets";

export type OrderInfo = {
  orderParams: Sdk.Manifold.Types.Order & {
    // Additional types for validation (eg. ensuring only the latest event is relevant)
    txHash: string;
    txTimestamp: number;
  };
  metadata: OrderMetadata;
};

type SaveResult = {
  id: string;
  status: string;
  txHash: string;
  triggerKind?: "new-order" | "reprice";
};

export const getOrderId = (listingId: number | string) =>
  // Manifold uses incrementing integers as order ids, so we set the id in the
  // database to be `keccak256(exchange, id)` (the exchange address is used in
  // order to prevent collisions once we integrate other exchange with similar
  // id mechanics).
  keccak256(
    ["string", "string", "uint256"],
    ["manifold", Sdk.Manifold.Addresses.Exchange[config.chainId], listingId]
  );

export const save = async (orderInfos: OrderInfo[]): Promise<SaveResult[]> => {
  const results: SaveResult[] = [];
  const orderValues: DbOrder[] = [];

  const handleOrder = async ({ orderParams, metadata }: OrderInfo) => {
    try {
      const id = getOrderId(orderParams.id);

      if (orderParams.details.totalPerSale !== 1) {
        return results.push({
          id,
          txHash: orderParams.txHash,
          status: "unsupported-order-fill-amount",
        });
      }

      if (orderParams.details.type_ !== 2) {
        return results.push({
          id,
          txHash: orderParams.txHash,
          status: "unsupported-order-type",
        });
      }

      if (orderParams.details.erc20 !== Sdk.Common.Addresses.Eth[config.chainId]) {
        return results.push({
          id,
          txHash: orderParams.txHash,
          status: "unsupported-payment-token",
        });
      }

      // startTime - the start time of the sale (if set to 0, then startTime will be set to the first bid/purchase)
      // endTime - the end time of the sale (if set to 0, then endTime will be the duration of the listing upon first bid/purchase)
      let validFrom: string;
      let validTo: string;
      if (orderParams.details.startTime === 0) {
        // In case we don't have the transaction's timestamp (since we're ingesting
        // orders from the API and not from on-chain data) we default it to 0
        validFrom = `date_trunc('seconds', to_timestamp(${orderParams.txTimestamp || 0}))`;
        validTo = "'infinity'";
      } else {
        validFrom = `date_trunc('seconds', to_timestamp(${orderParams.details.startTime}))`;
        validTo = orderParams.details.endTime
          ? `date_trunc('seconds', to_timestamp(${orderParams.details.endTime}))`
          : "'infinity'";
      }

      const orderResult = await redb.oneOrNone(
        ` 
          SELECT 
            raw_data,
            extract('epoch' from lower(orders.valid_between)) AS valid_from,
            fillability_status
          FROM orders 
          WHERE orders.id = $/id/ 
        `,
        { id }
      );

      if (orderResult) {
        // Only process new events
        if (Number(orderResult.valid_from) > orderParams.txTimestamp) {
          return results.push({
            id,
            txHash: orderParams.txHash,
            status: "redundant",
          });
        }

        // If an older order already exists then we just update some fields on it
        // (the updated fields won't alter the approval or fillability status)
        orderResult.raw_data.details = {
          ...orderResult.raw_data.details,
          ...(orderParams.details.initialAmount && {
            initialAmount: orderParams.details.initialAmount,
          }),
          startTime: orderParams.details.startTime,
          endTime: orderParams.details.endTime,
        };
        await idb.none(
          `
            UPDATE orders SET
              valid_between = tstzrange(${validFrom}, ${validTo}, '[]'),
              price = $/initialAmount/,
              value = $/initialAmount/,
              currency_price = $/initialAmount/,
              currency_value = $/initialAmount/,
              expiration = 'Infinity',
              updated_at = now(),
              raw_data = $/orderParams:json/
            WHERE orders.id = $/id/
          `,
          {
            initialAmount:
              orderParams.details.initialAmount || orderResult.raw_data.details.initialAmount,
            orderParams: orderResult.raw_data,
            id,
          }
        );

        return results.push({
          id,
          txHash: orderParams.txHash,
          status: "success",
          triggerKind: "reprice",
        });
      }

      // Ensure that the order is not cancelled
      const cancelResult = await redb.oneOrNone(
        `
          SELECT 1 FROM cancel_events
          WHERE order_id = $/id/
            AND timestamp >= $/timestamp/
          LIMIT 1
        `,
        {
          id,
          timestamp: orderParams.txTimestamp,
        }
      );
      if (cancelResult) {
        return results.push({
          id,
          txHash: orderParams.txHash,
          status: "redundant",
        });
      }

      // Ensure that the order is not filled
      const fillResult = await redb.oneOrNone(
        `
          SELECT 1 FROM fill_events_2
          WHERE order_id = $/id/
            AND timestamp >= $/timestamp/
          LIMIT 1
        `,
        {
          id,
          timestamp: orderParams.txTimestamp,
        }
      );
      if (fillResult) {
        return results.push({
          id,
          txHash: orderParams.txHash,
          status: "redundant",
        });
      }

      // Check: order fillability
      const fillabilityStatus = "fillable";
      const approvalStatus = "approved";
      try {
        await offChainCheck(orderParams);
      } catch {
        return results.push({
          id,
          status: "not-fillable",
          txHash: orderParams.txHash,
        });
      }

      // Check and save: associated token set
      const schemaHash = metadata.schemaHash ?? generateSchemaHash(metadata.schema);
      const contract = orderParams.token.address_;
      const tokenId = orderParams.token.id;
      const [{ id: tokenSetId }] = await tokenSet.singleToken.save([
        {
          id: `token:${contract}:${tokenId}`,
          schemaHash,
          contract: contract,
          tokenId: tokenId.toString(),
        },
      ]);

      // Handle: source
      const sources = await Sources.getInstance();
      let source = await sources.getOrInsert("manifold.xyz");
      if (metadata.source) {
        source = await sources.getOrInsert(metadata.source);
      }

      orderValues.push({
        id,
        kind: "manifold",
        side: "sell",
        fillability_status: fillabilityStatus,
        approval_status: approvalStatus,
        token_set_id: tokenSetId,
        token_set_schema_hash: toBuffer(schemaHash),
        maker: toBuffer(orderParams.seller),
        taker: toBuffer(AddressZero),
        price: orderParams.details.initialAmount,
        value: orderParams.details.initialAmount,
        currency: toBuffer(orderParams.details.erc20),
        currency_price: orderParams.details.initialAmount,
        currency_value: orderParams.details.initialAmount,
        needs_conversion: null,
        quantity_remaining: orderParams.details.totalAvailable.toString(),
        valid_between: `tstzrange(${validFrom}, ${validTo}, '[]')`,
        nonce: null,
        source_id_int: source?.id,
        is_reservoir: null,
        contract: toBuffer(contract),
        conduit: null,
        fee_bps: 0,
        fee_breakdown: [],
        dynamic: null,
        raw_data: orderParams,
        expiration: validTo,
        missing_royalties: null,
        normalized_value: null,
        currency_normalized_value: null,
      });

      return results.push({
        id,
        status: "success",
        txHash: orderParams.txHash,
        triggerKind: "new-order",
      });
    } catch (error) {
      logger.error(
        "orders-manifold-save",
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
  }

  await ordersUpdateById.addToQueue(
    results
      .filter(({ status }) => status === "success")
      .map(
        ({ id, txHash, triggerKind }) =>
          ({
            context: `${triggerKind}-${id}-${txHash}`,
            id,
            trigger: {
              kind: triggerKind,
            },
          } as ordersUpdateById.OrderInfo)
      )
  );

  return results;
};
