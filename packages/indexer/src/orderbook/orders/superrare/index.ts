import { AddressZero } from "@ethersproject/constants";
import { keccak256 } from "@ethersproject/solidity";
import * as Sdk from "@reservoir0x/sdk";
import pLimit from "p-limit";

import { idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { bn, compare, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import * as ordersUpdateById from "@/jobs/order-updates/by-id-queue";
import { Sources } from "@/models/sources";
import { DbOrder, OrderMetadata, generateSchemaHash } from "@/orderbook/orders/utils";
import * as tokenSet from "@/orderbook/token-sets";
import * as royalties from "@/utils/royalties";

export type OrderInfo = {
  orderParams: {
    // SDK parameters
    maker: string;
    contract: string;
    tokenId: string;
    price: string;
    currency: string;
    splitAddresses: string[];
    splitRatios: number[];
    // Validation parameters (for ensuring only the latest event is relevant)
    txHash: string;
    txTimestamp: number;
    txBlock: number;
    logIndex: number;
  };
  metadata: OrderMetadata;
};

type SaveResult = {
  id: string;
  status: string;
  triggerKind?: "new-order" | "reprice" | "cancel";
  txHash?: string;
  txTimestamp?: number;
  logIndex?: number;
  batchIndex?: number;
};

export const getOrderId = (contract: string, tokenId: string) =>
  keccak256(["string", "address", "uint256"], ["superrare", contract, tokenId]);

export const save = async (orderInfos: OrderInfo[]): Promise<SaveResult[]> => {
  const results: SaveResult[] = [];
  const orderValues: DbOrder[] = [];

  const handleOrder = async ({ orderParams, metadata }: OrderInfo) => {
    try {
      // On Superrare, we can only have a single currently active order per NFT
      const id = getOrderId(orderParams.contract, orderParams.tokenId);
      const order = new Sdk.SuperRare.Order(config.chainId, orderParams);

      // Ensure the order is not cancelled
      const cancelResult = await idb.oneOrNone(
        `
          SELECT 1 FROM cancel_events
          WHERE cancel_events.order_id = $/id/
            AND (cancel_events.block, cancel_events.log_index) > ($/block/, $/logIndex/)
          LIMIT 1
        `,
        {
          id,
          block: orderParams.txBlock,
          logIndex: orderParams.logIndex,
        }
      );
      if (cancelResult) {
        return results.push({
          id,
          status: "redundant",
        });
      }

      // Ensure the order is not filled
      const fillResult = await idb.oneOrNone(
        `
          SELECT 1 FROM fill_events_2
          WHERE fill_events_2.order_id = $/id/
            AND (fill_events_2.block, fill_events_2.log_index) > ($/block/, $/logIndex/)
          LIMIT 1
        `,
        {
          id,
          block: orderParams.txBlock,
          logIndex: orderParams.logIndex,
        }
      );
      if (fillResult) {
        return results.push({
          id,
          status: "redundant",
        });
      }

      const orderResult = await idb.oneOrNone(
        `
          SELECT
            extract('epoch' from lower(orders.valid_between)) AS valid_from,
            orders.block_number,
            orders.log_index
          FROM orders
          WHERE orders.id = $/id/
        `,
        { id }
      );

      // Check: sell order has Eth as payment token
      if (orderParams.currency !== Sdk.Common.Addresses.Eth[config.chainId]) {
        if (!orderResult) {
          return results.push({
            id,
            status: "unsupported-payment-token",
          });
        } else {
          // If the order already exists set its fillability status as cancelled
          // See https://github.com/reservoirprotocol/indexer/pull/1903/files#r976148340
          await idb.none(
            `
              UPDATE orders SET
                fillability_status = $/fillability_status/,
                maker = $/maker/,
                price = $/price/,
                currency_price = $/price/,
                value = $/price/,
                currency_value = $/price/,
                valid_between = tstzrange(date_trunc('seconds', to_timestamp(${orderParams.txTimestamp})), 'Infinity', '[]'),
                expiration = 'Infinity',
                updated_at = now(),
                taker = $/taker/,
                raw_data = $/orderParams:json/,
                block_number = $/blockNumber/,
                log_index = $/logIndex/
              WHERE orders.id = $/id/
            `,
            {
              fillability_status: "cancelled",
              maker: toBuffer(orderParams.maker),
              taker: toBuffer(AddressZero),
              price: orderParams.currency,
              orderParams,
              id,
              blockNumber: orderParams.txBlock,
              logIndex: orderParams.logIndex,
            }
          );

          return results.push({
            id,
            status: "success",
            triggerKind: "cancel",
            txHash: orderParams.txHash,
            txTimestamp: orderParams.txTimestamp,
            logIndex: orderParams.logIndex,
          });
        }
      }

      if (orderResult) {
        // Decide whether the current trigger is the latest one
        let isLatestTrigger: boolean;
        if (orderResult.block_number && orderResult.log_index) {
          isLatestTrigger =
            compare(
              [orderResult.block_number, orderResult.log_index],
              [orderParams.txBlock, orderParams.logIndex]
            ) < 0;
        } else {
          isLatestTrigger = Number(orderResult.valid_from) < orderParams.txTimestamp;
        }

        if (isLatestTrigger) {
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
                raw_data = $/orderParams:json/,
                block_number = $/blockNumber/,
                log_index = $/logIndex/
              WHERE orders.id = $/id/
            `,
            {
              maker: toBuffer(orderParams.maker),
              price: orderParams.price,
              orderParams,
              id,
              blockNumber: orderParams.txBlock,
              logIndex: orderParams.logIndex,
            }
          );

          return results.push({
            id,
            status: "success",
            triggerKind: "reprice",
            txHash: orderParams.txHash,
            txTimestamp: orderParams.txTimestamp,
            logIndex: orderParams.logIndex,
          });
        } else {
          // If a newer order already exists, then we just skip processing
          return results.push({
            id,
            status: "redundant",
          });
        }
      }

      // Check and save: associated token set
      const schemaHash = metadata.schemaHash ?? generateSchemaHash(metadata.schema);

      const [{ id: tokenSetId }] = await tokenSet.singleToken.save([
        {
          id: `token:${orderParams.contract.toLowerCase()}:${orderParams.tokenId.toLowerCase()}`,
          schemaHash,
          contract: orderParams.contract,
          tokenId: orderParams.tokenId,
        },
      ]);

      // Handle: source
      const sources = await Sources.getInstance();
      let source = await sources.getOrInsert("superrare.com");
      if (metadata.source) {
        source = await sources.getOrInsert(metadata.source);
      }

      // Handle: fees
      const treasury = "0x860a80d33e85e97888f1f0c75c6e5bbd60b48da9";
      let feeBreakdown = [
        // SuperRare get 15% commission on first sale, after that the creator has 10% royalties
        {
          kind: "marketplace",
          recipient: treasury,
          bps: 1500,
        },
      ];

      // Handle: royalties
      const onChainRoyalties = await royalties.getRoyalties(
        order.params.contract,
        order.params.tokenId,
        "onchain"
      );

      if (!onChainRoyalties.length) {
        feeBreakdown = [];
      }

      const feeBps = feeBreakdown.map(({ bps }) => bps).reduce((a, b) => Number(a) + Number(b), 0);

      // Buyer pays 3% on all purchases
      const price = bn(order.params.price).add(bn(order.params.price).mul(3).div(100)).toString();

      const validFrom = `date_trunc('seconds', to_timestamp(${orderParams.txTimestamp}))`;
      const validTo = `'Infinity'`;
      orderValues.push({
        id,
        kind: `superrare`,
        side: "sell",
        fillability_status: "fillable",
        approval_status: "approved",
        token_set_id: tokenSetId,
        token_set_schema_hash: toBuffer(schemaHash),
        maker: toBuffer(orderParams.maker),
        taker: toBuffer(AddressZero),
        price,
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
        fee_bps: feeBps,
        fee_breakdown: feeBreakdown,
        dynamic: null,
        raw_data: orderParams,
        expiration: validTo,
        missing_royalties: null,
        normalized_value: null,
        currency_normalized_value: null,
        block_number: orderParams.txBlock,
        log_index: orderParams.logIndex,
      });

      return results.push({
        id,
        status: "success",
        triggerKind: "new-order",
        txHash: orderParams.txHash,
        txTimestamp: orderParams.txTimestamp,
        logIndex: orderParams.logIndex,
      });
    } catch (error) {
      logger.error(
        "orders-superrare-save",
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
        "block_number",
        "log_index",
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
        ({ id, triggerKind, txHash, txTimestamp, logIndex, batchIndex }) =>
          ({
            context: `${triggerKind}-${id}-${txHash}`,
            id,
            trigger: {
              kind: triggerKind,
              txHash,
              txTimestamp,
              logIndex,
              batchIndex,
            },
          } as ordersUpdateById.OrderInfo)
      )
  );

  return results;
};
