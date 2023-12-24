import { AddressZero } from "@ethersproject/constants";
import { keccak256 } from "@ethersproject/solidity";
import * as Sdk from "@reservoir0x/sdk";
import pLimit from "p-limit";

import { idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { compare, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { Sources } from "@/models/sources";
import { DbOrder, OrderMetadata, generateSchemaHash } from "@/orderbook/orders/utils";
import { offChainCheck } from "@/orderbook/orders/zora/check";
import * as tokenSet from "@/orderbook/token-sets";
import {
  orderUpdatesByIdJob,
  OrderUpdatesByIdJobPayload,
} from "@/jobs/order-updates/order-updates-by-id-job";

export type OrderIdParams = {
  tokenContract: string;
  tokenId: string;
};

export type OrderInfo = {
  orderParams: {
    // SDK parameters
    seller: string;
    maker: string;
    tokenContract: string;
    tokenId: string;
    askPrice: string;
    askCurrency: string;
    sellerFundsRecipient: string;
    findersFeeBps: number;
    side: "sell" | "buy";
    // Validation parameters (for ensuring only the latest event is relevant)
    txHash: string;
    txTimestamp: number;
    txBlock: number;
    logIndex: number;
    batchIndex: number;
  };
  metadata: OrderMetadata;
};

export function getOrderId(orderParams: OrderIdParams) {
  const orderId = keccak256(
    ["string", "string", "uint256"],
    ["zora-v3", orderParams.tokenContract, orderParams.tokenId]
  );
  return orderId;
}

type SaveResult = {
  id: string;
  status: string;
  triggerKind?: "cancel" | "new-order" | "reprice";
  unfillable?: boolean;
  txHash?: string;
  txTimestamp?: number;
  logIndex?: number;
  batchIndex?: number;
};

export const save = async (orderInfos: OrderInfo[]): Promise<SaveResult[]> => {
  const results: SaveResult[] = [];
  const orderValues: DbOrder[] = [];

  const handleOrder = async ({ orderParams, metadata }: OrderInfo) => {
    try {
      const id = getOrderId(orderParams);

      // Check: order doesn't already exist
      const orderResult = await idb.oneOrNone(
        ` 
          SELECT 
            extract('epoch' from lower(orders.valid_between)) AS valid_from,
            orders.block_number,
            orders.log_index,
            orders.fillability_status
          FROM orders 
          WHERE orders.id = $/id/ 
        `,
        { id }
      );

      // Check: sell order has Eth as payment token
      if (orderParams.askCurrency !== Sdk.Common.Addresses.Native[config.chainId]) {
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
                fillability_status = $/fillabilityStatus/,
                expiration = to_timestamp(${orderParams.txTimestamp}),
                updated_at = now(),
                block_number = $/blockNumber/,
                log_index = $/logIndex/
              WHERE orders.id = $/id/
            `,
            {
              fillabilityStatus: "cancelled",
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
            batchIndex: orderParams.batchIndex,
          });
        }
      }

      // Check: order fillability
      let fillabilityStatus = "fillable";
      let approvalStatus = "approved";
      try {
        await offChainCheck(orderParams, { onChainApprovalRecheck: true });
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
            txHash: orderParams.txHash,
            status: "not-fillable",
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
                fillability_status = $/fillability_status/,
                approval_status = $/approval_status/,
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
              fillability_status: fillabilityStatus,
              approval_status: approvalStatus,
              maker: toBuffer(orderParams.maker),
              taker: toBuffer(AddressZero),
              price: orderParams.askPrice,
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
            batchIndex: orderParams.batchIndex,
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
      const contract = orderParams.tokenContract;

      const [{ id: tokenSetId }] = await tokenSet.singleToken.save([
        {
          id: `token:${contract}:${orderParams.tokenId}`,
          schemaHash,
          contract: contract,
          tokenId: orderParams.tokenId.toString(),
        },
      ]);

      // Handle: source
      const sources = await Sources.getInstance();
      let source = await sources.getOrInsert("zora.co");
      if (metadata.source) {
        source = await sources.getOrInsert(metadata.source);
      }

      const validFrom = `date_trunc('seconds', to_timestamp(${orderParams.txTimestamp}))`;
      const validTo = `'Infinity'`;

      orderValues.push({
        id,
        kind: "zora-v3",
        side: orderParams.side,
        fillability_status: fillabilityStatus,
        approval_status: approvalStatus,
        token_set_id: tokenSetId,
        token_set_schema_hash: toBuffer(schemaHash),
        maker: toBuffer(orderParams.maker),
        taker: toBuffer(AddressZero),
        price: orderParams.askPrice.toString(),
        value: orderParams.askPrice.toString(),
        currency: toBuffer(orderParams.askCurrency),
        currency_price: orderParams.askPrice.toString(),
        currency_value: orderParams.askPrice.toString(),
        needs_conversion: null,
        quantity_remaining: "1",
        valid_between: `tstzrange(${validFrom}, ${validTo}, '[]')`,
        nonce: null,
        source_id_int: source?.id,
        is_reservoir: null,
        contract: toBuffer(contract),
        conduit: toBuffer(
          orderParams.side === "sell"
            ? Sdk.Zora.Addresses.Erc721TransferHelper[config.chainId]
            : Sdk.Zora.Addresses.Erc20TransferHelper[config.chainId]
        ),
        fee_bps: 0,
        fee_breakdown: [],
        dynamic: null,
        raw_data: orderParams,
        expiration: validTo,
        missing_royalties: null,
        normalized_value: null,
        currency_normalized_value: null,
        block_number: orderParams.txBlock,
        log_index: orderParams.logIndex,
      });

      const unfillable =
        fillabilityStatus !== "fillable" || approvalStatus !== "approved" ? true : undefined;

      results.push({
        id,
        status: "success",
        triggerKind: "new-order",
        unfillable,
        txHash: orderParams.txHash,
        txTimestamp: orderParams.txTimestamp,
        logIndex: orderParams.logIndex,
        batchIndex: orderParams.batchIndex,
      });
    } catch (error) {
      logger.error(
        "orders-zora-v3-save",
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
        "block_number",
        "log_index",
      ],
      {
        table: "orders",
      }
    );
    await idb.none(pgp.helpers.insert(orderValues, columns) + " ON CONFLICT DO NOTHING");
  }

  await orderUpdatesByIdJob.addToQueue(
    results
      .filter(({ status, unfillable }) => status === "success" && !unfillable)
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
          } as OrderUpdatesByIdJobPayload)
      )
  );

  return results;
};
