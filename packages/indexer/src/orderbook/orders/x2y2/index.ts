import { AddressZero } from "@ethersproject/constants";
import * as Sdk from "@reservoir0x/sdk";
import _ from "lodash";
import pLimit from "p-limit";

import { idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { bn, now, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import {
  orderUpdatesByIdJob,
  OrderUpdatesByIdJobPayload,
} from "@/jobs/order-updates/order-updates-by-id-job";
import * as commonHelpers from "@/orderbook/orders/common/helpers";
import { DbOrder, OrderMetadata, generateSchemaHash } from "@/orderbook/orders/utils";
import { offChainCheck } from "@/orderbook/orders/x2y2/check";
import * as tokenSet from "@/orderbook/token-sets";
import { Sources } from "@/models/sources";
import { checkMarketplaceIsFiltered } from "@/utils/marketplace-blacklists";
import * as royalties from "@/utils/royalties";

export type OrderInfo = {
  orderParams: Sdk.X2Y2.Types.Order;
  metadata: OrderMetadata;
};

export type SaveResult = {
  id: string;
  status: string;
  unfillable?: boolean;
};

export const save = async (orderInfos: OrderInfo[]): Promise<SaveResult[]> => {
  const results: SaveResult[] = [];
  const orderValues: DbOrder[] = [];

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

      const isFiltered = await checkMarketplaceIsFiltered(order.params.nft.token, [
        Sdk.X2Y2.Addresses.Erc721Delegate[config.chainId],
        Sdk.X2Y2.Addresses.Erc1155Delegate[config.chainId],
      ]);

      if (isFiltered) {
        return results.push({
          id,
          status: "filtered",
        });
      }

      const currentTime = now();

      // Check: order is not expired
      const expirationTime = order.params.deadline;
      if (currentTime >= expirationTime) {
        return results.push({
          id,
          status: "expired",
        });
      }

      // Check: sell order has Eth as payment token
      if (
        order.params.type === "sell" &&
        order.params.currency !== Sdk.Common.Addresses.Native[config.chainId]
      ) {
        return results.push({
          id,
          status: "unsupported-payment-token",
        });
      }

      // Check: buy order has WNative as payment token
      if (
        order.params.type === "buy" &&
        order.params.currency !== Sdk.Common.Addresses.WNative[config.chainId]
      ) {
        return results.push({
          id,
          status: "unsupported-payment-token",
        });
      }

      // Check: amount
      if (order.params.amount !== 1) {
        return results.push({
          id,
          status: "unsupported-amount",
        });
      }

      // Check: order fillability
      let fillabilityStatus = "fillable";
      let approvalStatus = "approved";
      try {
        await offChainCheck(order, undefined, {
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
      let tokenSetId: string | undefined;
      const schemaHash = metadata.schemaHash ?? generateSchemaHash(metadata.schema);

      switch (order.params.kind) {
        case "single-token": {
          [{ id: tokenSetId }] = await tokenSet.singleToken.save([
            {
              id: `token:${order.params.nft.token}:${order.params.nft.tokenId!}`,
              schemaHash,
              contract: order.params.nft.token,
              tokenId: order.params.nft.tokenId!,
            },
          ]);

          break;
        }

        case "collection-wide": {
          const collection = order.params.nft.token.toLowerCase();
          [{ id: tokenSetId }] = await tokenSet.contractWide.save([
            {
              id: `contract:${collection}`,
              schemaHash,
              contract: collection,
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
      const feeBreakdown = [
        {
          kind: "marketplace",
          recipient: Sdk.X2Y2.Addresses.FeeManager[config.chainId],
          bps: 50,
        },
      ];

      const side = order.params.type === "sell" ? "sell" : "buy";
      const price = bn(order.params.price);

      // Handle: royalties
      if (order.params.royalty_fee > 0) {
        // Assume X2Y2 royalties match the OpenSea royalties (in reality X2Y2
        // have their own proprietary royalty system which we do not index at
        // the moment)
        let openSeaRoyalties: royalties.Royalty[];

        if (order.params.kind === "single-token") {
          openSeaRoyalties = await royalties.getRoyalties(
            order.params.nft.token,
            order.params.nft.tokenId,
            "opensea"
          );
        } else {
          openSeaRoyalties = await royalties.getRoyaltiesByTokenSet(tokenSetId, "opensea");
        }

        if (openSeaRoyalties.length) {
          feeBreakdown.push({
            kind: "royalty",
            recipient: openSeaRoyalties[0].recipient,
            bps: Math.floor(order.params.royalty_fee / 100),
          });
        }
      }

      // Handle: royalties on top
      const defaultRoyalties =
        side === "sell"
          ? await royalties.getRoyalties(
              order.params.nft.token,
              order.params.nft.tokenId,
              "default"
            )
          : await royalties.getRoyaltiesByTokenSet(tokenSetId, "default");

      const totalBuiltInBps = feeBreakdown
        .map(({ bps, kind }) => (kind === "royalty" ? bps : 0))
        .reduce((a, b) => a + b, 0);
      const totalDefaultBps = defaultRoyalties.map(({ bps }) => bps).reduce((a, b) => a + b, 0);

      const missingRoyalties = [];
      let missingRoyaltyAmount = bn(0);
      if (totalBuiltInBps < totalDefaultBps) {
        const validRecipients = defaultRoyalties.filter(
          ({ bps, recipient }) => bps && recipient !== AddressZero
        );
        if (validRecipients.length) {
          const bpsDiff = totalDefaultBps - totalBuiltInBps;
          const amount = bn(price).mul(bpsDiff).div(10000);
          missingRoyaltyAmount = missingRoyaltyAmount.add(amount);

          // Split the missing royalties pro-rata across all royalty recipients
          const totalBps = _.sumBy(validRecipients, ({ bps }) => bps);
          for (const { bps, recipient } of validRecipients) {
            // TODO: Handle lost precision (by paying it to the last or first recipient)
            missingRoyalties.push({
              bps: Math.floor((bpsDiff * bps) / totalBps),
              amount: amount.mul(bps).div(totalBps).toString(),
              recipient,
            });
          }
        }
      }

      const feeBps = feeBreakdown.map(({ bps }) => bps).reduce((a, b) => Number(a) + Number(b), 0);

      // Handle: price and value
      const value = side === "sell" ? price : price.sub(price.mul(feeBps).div(10000));
      const normalizedValue =
        side === "sell"
          ? bn(value).add(missingRoyaltyAmount).toString()
          : bn(value).sub(missingRoyaltyAmount).toString();

      // Handle: source
      const sources = await Sources.getInstance();
      const source = await sources.getOrInsert("x2y2.io");

      // Handle: native Reservoir orders
      const isReservoir = false;

      // Handle: conduit
      let conduit = Sdk.X2Y2.Addresses.Exchange[config.chainId];
      if (order.params.type === "sell") {
        conduit =
          order.params.delegateType === Sdk.X2Y2.Types.DelegationType.ERC721
            ? Sdk.X2Y2.Addresses.Erc721Delegate[config.chainId]
            : Sdk.X2Y2.Addresses.Erc1155Delegate[config.chainId];
      }

      const validFrom = `date_trunc('seconds', to_timestamp(${currentTime}))`;
      const validTo = `date_trunc('seconds', to_timestamp(${order.params.deadline}))`;
      orderValues.push({
        id,
        kind: "x2y2",
        side,
        fillability_status: fillabilityStatus,
        approval_status: approvalStatus,
        token_set_id: tokenSetId,
        token_set_schema_hash: toBuffer(schemaHash),
        maker: toBuffer(order.params.maker),
        taker: toBuffer(order.params.taker),
        price: price.toString(),
        value: value.toString(),
        currency: toBuffer(order.params.currency),
        currency_price: price.toString(),
        currency_value: value.toString(),
        needs_conversion: null,
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
        missing_royalties: missingRoyalties,
        normalized_value: normalizedValue,
        currency_normalized_value: normalizedValue,
        originated_at: metadata.originatedAt || null,
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
        { name: "missing_royalties", mod: ":json" },
        "normalized_value",
        "currency_normalized_value",
        "originated_at",
      ],
      {
        table: "orders",
      }
    );
    await idb.none(pgp.helpers.insert(orderValues, columns) + " ON CONFLICT DO NOTHING");

    await orderUpdatesByIdJob.addToQueue(
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
            } as OrderUpdatesByIdJobPayload)
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

        await orderUpdatesByIdJob.addToQueue(
          result.map(
            ({ id }) =>
              ({
                context: `cancelled-${id}`,
                id,
                trigger: {
                  kind: "cancel",
                },
              } as OrderUpdatesByIdJobPayload)
          )
        );
      }
    }
  }

  return results;
};
