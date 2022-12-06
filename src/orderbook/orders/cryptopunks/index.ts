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
    side: "sell" | "buy";
    tokenId: string;
    price: string;
    taker?: string;
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

export const getOrderId = (tokenId: string) =>
  keccak256(["string", "uint256"], ["cryptopunks", tokenId]);

export const save = async (orderInfos: OrderInfo[]): Promise<SaveResult[]> => {
  const results: SaveResult[] = [];
  const orderValues: DbOrder[] = [];

  const handleOrder = async ({ orderParams, metadata }: OrderInfo) => {
    try {
      // We can only have a single currently active order per token
      const id = getOrderId(orderParams.tokenId);

      // We only support listings at the moment
      if (orderParams.side !== "sell") {
        return results.push({
          id,
          status: "unsupported-side",
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
                taker = $/taker/,
                raw_data = $/orderParams:json/
              WHERE orders.id = $/id/
            `,
            {
              maker: toBuffer(orderParams.maker),
              taker: toBuffer(orderParams.taker ?? AddressZero),
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

      const contract = Sdk.CryptoPunks.Addresses.Exchange[config.chainId];
      const [{ id: tokenSetId }] = await tokenSet.singleToken.save([
        {
          id: `token:${contract}:${orderParams.tokenId}`,
          schemaHash,
          contract: contract,
          tokenId: orderParams.tokenId,
        },
      ]);

      // Handle: source
      const sources = await Sources.getInstance();
      let source = await sources.getOrInsert("cryptopunks.app");
      if (metadata.source) {
        source = await sources.getOrInsert(metadata.source);
      }

      const validFrom = `date_trunc('seconds', to_timestamp(${orderParams.txTimestamp}))`;
      const validTo = `'Infinity'`;
      orderValues.push({
        id,
        kind: "cryptopunks",
        side: orderParams.side,
        fillability_status: "fillable",
        approval_status: "approved",
        token_set_id: tokenSetId,
        token_set_schema_hash: toBuffer(schemaHash),
        maker: toBuffer(orderParams.maker),
        taker: toBuffer(orderParams.taker ?? AddressZero),
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
        txHash: orderParams.txHash,
        status: "success",
        triggerKind: "new-order",
      });
    } catch (error) {
      logger.error(
        "orders-cryptopunks-save",
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
