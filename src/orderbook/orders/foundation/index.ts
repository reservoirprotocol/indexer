import { AddressZero } from "@ethersproject/constants";
import { keccak256 } from "@ethersproject/solidity";
import pLimit from "p-limit";

import { idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { toBuffer } from "@/common/utils";
import * as ordersUpdateById from "@/jobs/order-updates/by-id-queue";
import { DbOrder, OrderMetadata, generateSchemaHash } from "@/orderbook/orders/utils";
import * as tokenSet from "@/orderbook/token-sets";
import { Sources } from "@/models/sources";

export type OrderInfo = {
  orderParams: {
    maker: string;
    contract: string;
    tokenId: string;
    price: string;
    txHash: string;
    txTimestamp: number;
  };
  metadata: OrderMetadata;
};

type SaveResult = {
  id: string;
  txHash?: string;
  status: string;
};

export const save = async (orderInfos: OrderInfo[]): Promise<SaveResult[]> => {
  const results: SaveResult[] = [];
  const orderValues: DbOrder[] = [];

  const handleOrder = async ({ orderParams, metadata }: OrderInfo) => {
    try {
      // On Foundation, we can only have a single currently active order per NFT.
      const id = keccak256(["address", "uint256"], [orderParams.contract, orderParams.tokenId]);

      // Ensure that the order is not cancelled.
      const cancelResult = await idb.oneOrNone(
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

      // Ensure that the order is not filled.
      const fillResult = await idb.oneOrNone(
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

      const orderResult = await idb.oneOrNone(
        `
          SELECT
            lower(orders.valid_between) AS valid_from
          FROM orders
          WHERE orders.id = $/id/
        `,
        { id }
      );
      if (orderResult) {
        if (Number(orderResult.valid_from) < orderParams.txTimestamp) {
          // If an older order already exists then we just update some fields on it.
          await idb.none(
            `
              UPDATE orders SET
                fillability_status = 'fillable',
                maker = $/maker/,
                price = $/price/,
                value = $/price/,
                valid_between = tstzrange(date_trunc('seconds', to_timestamp(${orderParams.txTimestamp})), 'Infinity', '[]'),
                expiration = 'Infinity',
                updated_at = now()
              WHERE orders.id = $/id/
            `,
            {
              maker: toBuffer(orderParams.maker),
              price: orderParams.price,
              id,
            }
          );

          return results.push({
            id,
            txHash: orderParams.txHash,
            status: "success",
          });
        } else {
          // If a newer order already exists, then we just skip processing.
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

      // Handle: source and fees breakdown
      let source: string | undefined;
      let sourceId: number | null = null;
      if (metadata.source) {
        const sources = await Sources.getInstance();
        const sourceEntity = await sources.getOrInsert(metadata.source);
        source = sourceEntity.address;
        sourceId = sourceEntity.id;
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
      const royaltiesResult = await idb.oneOrNone(
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
        quantity_remaining: "1",
        valid_between: `tstzrange(${validFrom}, ${validTo}, '[]')`,
        nonce: null,
        source_id: source ? toBuffer(source) : null,
        source_id_int: sourceId,
        is_reservoir: null,
        contract: toBuffer(orderParams.contract),
        conduit: null,
        fee_bps: feeBreakdown.map((fb) => fb.bps).reduce((a, b) => a + b, 0),
        fee_breakdown: feeBreakdown,
        dynamic: null,
        raw_data: orderParams,
        expiration: validTo,
      });

      return results.push({
        id,
        txHash: orderParams.txHash,
        status: "success",
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
        "quantity_remaining",
        { name: "valid_between", mod: ":raw" },
        "nonce",
        "source_id",
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

    await ordersUpdateById.addToQueue(
      results.map(
        ({ id, txHash }) =>
          ({
            context: `new-order-${id}-${txHash}`,
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
