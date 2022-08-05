import * as Sdk from "@reservoir0x/sdk";
import pLimit from "p-limit";

import { idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { bn, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import * as ordersUpdateById from "@/jobs/order-updates/by-id-queue";
import * as commonHelpers from "@/orderbook/orders/common/helpers";
import { DbOrder, OrderMetadata, generateSchemaHash } from "@/orderbook/orders/utils";
import { offChainCheck } from "@/orderbook/orders/x2y2/check";
import * as tokenSet from "@/orderbook/token-sets";
import { Sources } from "@/models/sources";

export type OrderInfo = {
  orderParams: Sdk.X2Y2.Types.Order;
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

  // We don't relay X2Y2 orders to Arweave since there is no way to check
  // the validity of those orders in a decentralized way (we fully depend
  // on X2Y2's API for that).

  const successOrders: Sdk.X2Y2.Types.Order[] = [];
  const handleOrder = async ({ orderParams, metadata }: OrderInfo) => {
    try {
      const order = new Sdk.X2Y2.Order(config.chainId, orderParams);
      const id = order.params.itemHash;

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
      const kind = await commonHelpers.getContractKind(order.params.nft.token);
      if (!kind) {
        return results.push({
          id,
          status: "unknown-order-kind",
        });
      }

      const currentTime = Math.floor(Date.now() / 1000);

      // Check: order is not expired
      const expirationTime = order.params.deadline;
      if (currentTime >= expirationTime) {
        return results.push({
          id,
          status: "expired",
        });
      }

      if (order.params.type !== "sell") {
        return results.push({
          id,
          status: "unsupported-side",
        });
      }

      // Check: sell order has Eth as payment token
      if (
        order.params.type === "sell" &&
        order.params.currency !== Sdk.Common.Addresses.Eth[config.chainId]
      ) {
        return results.push({
          id,
          status: "unsupported-payment-token",
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
              id: `token:${order.params.nft.token}:${order.params.nft.tokenId}`,
              schemaHash,
              contract: order.params.nft.token,
              tokenId: order.params.nft.tokenId,
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

      // Handle: fees
      const feeBps = 50;
      const feeBreakdown = [
        {
          kind: "royalty",
          recipient: Sdk.X2Y2.Addresses.FeeManager[config.chainId],
          bps: feeBps,
        },
      ];

      // Handle: price and value
      const price = bn(order.params.price);
      const value = order.params.type === "sell" ? price : price.sub(price.mul(feeBps).div(10000));

      // Handle: source
      const sources = await Sources.getInstance();
      const source = await sources.getOrInsert("x2y2.io");

      // Handle: native Reservoir orders
      const isReservoir = false;

      // Handle: conduit
      const conduit = Sdk.X2Y2.Addresses.Erc721Delegate[config.chainId];

      const validFrom = `date_trunc('seconds', to_timestamp(0))`;
      const validTo = `date_trunc('seconds', to_timestamp(${order.params.deadline}))`;
      orderValues.push({
        id,
        kind: "x2y2",
        side: "sell",
        fillability_status: fillabilityStatus,
        approval_status: approvalStatus,
        token_set_id: tokenSetId,
        token_set_schema_hash: toBuffer(schemaHash),
        maker: toBuffer(order.params.maker),
        taker: toBuffer(order.params.taker),
        price: price.toString(),
        value: value.toString(),
        quantity_remaining: "1",
        valid_between: `tstzrange(${validFrom}, ${validTo}, '[]')`,
        nonce: null,
        source_id_int: source?.id,
        is_reservoir: isReservoir ? isReservoir : null,
        contract: toBuffer(order.params.nft.token),
        conduit: toBuffer(conduit),
        fee_bps: feeBps,
        fee_breakdown: feeBreakdown || null,
        dynamic: null,
        raw_data: order.params,
        expiration: validTo,
      });

      results.push({
        id,
        status: "success",
        unfillable:
          fillabilityStatus !== "fillable" || approvalStatus !== "approved" ? true : undefined,
      });

      if (!results[results.length - 1].unfillable) {
        successOrders.push(orderParams);
      }
    } catch (error) {
      logger.error(
        "orders-x2y2-save",
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

    // When lowering the price of a listing, X2Y2 will off-chain cancel
    // all previous orders (they can do that by having their backend to
    // refuse signing on any previous orders).
    // https://discordapp.com/channels/977147775366082560/977189354738962463/987253907430449213
    for (const orderParams of successOrders) {
      if (orderParams.type === "sell") {
        const result = await idb.manyOrNone(
          `
            WITH x AS (
              SELECT
                orders.id
              FROM orders
              WHERE orders.kind = 'x2y2'
                AND orders.side = 'sell'
                AND orders.maker = $/maker/
                AND orders.token_set_id = $/tokenSetId/
                AND (orders.fillability_status = 'fillable' OR orders.fillability_status = 'no-balance')
                AND orders.price > $/price/
            )
            UPDATE orders AS o SET
              fillability_status = 'cancelled'
            FROM x
            WHERE o.id = x.id
            RETURNING o.id
          `,
          {
            maker: toBuffer(orderParams.maker),
            tokenSetId: `token:${orderParams.nft.token}:${orderParams.nft.tokenId}`.toLowerCase(),
            price: orderParams.price,
          }
        );

        await ordersUpdateById.addToQueue(
          result.map(
            ({ id }) =>
              ({
                context: `cancelled-${id}`,
                id,
                trigger: {
                  kind: "new-order",
                },
              } as ordersUpdateById.OrderInfo)
          )
        );
      }
    }
  }

  return results;
};
