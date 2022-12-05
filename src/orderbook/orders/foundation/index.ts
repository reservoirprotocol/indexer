import { AddressZero } from "@ethersproject/constants";
import { keccak256 } from "@ethersproject/solidity";
import * as Sdk from "@reservoir0x/sdk";
import pLimit from "p-limit";

import { idb, pgp, redb } from "@/common/db";
import { logger } from "@/common/logger";
import { toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import * as ordersUpdateById from "@/jobs/order-updates/by-id-queue";
import { DbOrder, OrderMetadata, generateSchemaHash } from "@/orderbook/orders/utils";
import * as tokenSet from "@/orderbook/token-sets";
import { Sources } from "@/models/sources";

export type OrderInfo = {
  orderParams: {
    // SDK types
    maker: string;
    contract: string;
    tokenId: string;
    price: string;
    // Additional types for validation (eg. ensuring only the latest event is relevant)
    txHash: string;
    txTimestamp: number;
  };
  metadata: OrderMetadata;
};

type SaveResult = {
  id: string;
  txHash?: string;
  status: string;
  triggerKind?: "new-order" | "reprice";
};

export const getOrderId = (contract: string, tokenId: string) =>
  // TODO: Add the marketplace identifier to the order id (see Cryptopunks)
  keccak256(["address", "uint256"], [contract, tokenId]);

export const save = async (orderInfos: OrderInfo[]): Promise<SaveResult[]> => {
  const results: SaveResult[] = [];
  const orderValues: DbOrder[] = [];

  const handleOrder = async ({ orderParams, metadata }: OrderInfo) => {
    try {
      // On Foundation, we can only have a single currently active order per NFT
      const id = getOrderId(orderParams.contract, orderParams.tokenId);

      // Ensure that the order is not cancelled
      const cancelResult = await redb.oneOrNone(
        `
          SELECT 1 FROM cancel_events
          WHERE order_id = $/id/
            AND timestamp >= $/timestamp/
          LIMIT 1
        `,
        { id, timestamp: orderParams.txTimestamp }
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
        { id, timestamp: orderParams.txTimestamp }
      );
      if (fillResult) {
        return results.push({
          id,
          txHash: orderParams.txHash,
          status: "redundant",
        });
      }

      const orderResult = await redb.oneOrNone(
        `
          SELECT
            extract('epoch' from lower(orders.valid_between)) AS valid_from
          FROM orders
          WHERE orders.id = $/id/
        `,
        { id }
      );
      if (orderResult) {
        if (Number(orderResult.valid_from) < orderParams.txTimestamp) {
          // If an older order already exists then we just update some fields on it
          await idb.none(
            `
              UPDATE orders SET
                fillability_status = 'fillable',
                maker = $/maker/,
                price = $/price/,
                currency_price = $/price/,
                value = $/price/,
                currency_value = $/price/,
                valid_between = tstzrange(date_trunc('seconds', to_timestamp(${orderParams.txTimestamp})), 'Infinity', '[]'),
                expiration = 'Infinity',
                updated_at = now(),
                raw_data = $/orderParams:json/
              WHERE orders.id = $/id/
            `,
            {
              maker: toBuffer(orderParams.maker),
              price: orderParams.price,
              orderParams,
              id,
            }
          );

          return results.push({
            id,
            txHash: orderParams.txHash,
            status: "success",
            triggerKind: "reprice",
          });
        } else {
          // If a newer order already exists, then we just skip processing
          return results.push({
            id,
            txHash: orderParams.txHash,
            status: "redundant",
          });
        }
      }

      // Check and save: associated token set
      const schemaHash = metadata.schemaHash ?? generateSchemaHash(metadata.schema);

      const [{ id: tokenSetId }] = await tokenSet.singleToken.save([
        {
          id: `token:${orderParams.contract}:${orderParams.tokenId}`,
          schemaHash,
          contract: orderParams.contract,
          tokenId: orderParams.tokenId,
        },
      ]);

      // Handle: source
      const sources = await Sources.getInstance();
      let source = await sources.getOrInsert("foundation.app");
      if (metadata.source) {
        source = await sources.getOrInsert(metadata.source);
      }

      // Handle: marketplace fees
      const feeBreakdown = [
        // 5% of the price goes to the Foundation treasury.
        {
          kind: "marketplace",
          recipient: "0x67df244584b67e8c51b10ad610aaffa9a402fdb6",
          bps: 500,
        },
      ];

      // Handle: royalties
      const royaltiesResult = await redb.oneOrNone(
        `
          SELECT collections.royalties FROM collections
          WHERE collections.contract = $/contract/
          LIMIT 1
        `,
        { contract: toBuffer(orderParams.contract) }
      );
      for (const { bps, recipient } of royaltiesResult?.royalties || []) {
        feeBreakdown.push({
          kind: "royalty",
          recipient,
          bps: Number(bps),
        });
      }

      const validFrom = `date_trunc('seconds', to_timestamp(${orderParams.txTimestamp}))`;
      const validTo = `'Infinity'`;
      orderValues.push({
        id,
        kind: `foundation`,
        side: "sell",
        fillability_status: "fillable",
        approval_status: "approved",
        token_set_id: tokenSetId,
        token_set_schema_hash: toBuffer(schemaHash),
        maker: toBuffer(orderParams.maker),
        taker: toBuffer(AddressZero),
        price: orderParams.price.toString(),
        value: orderParams.price.toString(),
        currency: toBuffer(Sdk.Common.Addresses.Eth[config.chainId]),
        currency_price: orderParams.price.toString(),
        currency_value: orderParams.price.toString(),
        needs_conversion: null,
        quantity_remaining: "1",
        valid_between: `tstzrange(${validFrom}, ${validTo}, '[]')`,
        nonce: null,
        source_id_int: source?.id,
        is_reservoir: null,
        contract: toBuffer(orderParams.contract),
        conduit: null,
        fee_bps: feeBreakdown.map((fb) => fb.bps).reduce((a, b) => a + b, 0),
        fee_breakdown: feeBreakdown,
        dynamic: null,
        raw_data: orderParams,
        expiration: validTo,
        missing_royalties: null,
        normalized_value: null,
        currency_normalized_value: null,
      });

      return results.push({
        id,
        txHash: orderParams.txHash,
        status: "success",
        triggerKind: "new-order",
      });
    } catch (error) {
      logger.error(
        "orders-foundation-save",
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
