import { AddressZero } from "@ethersproject/constants";
import * as Sdk from "@reservoir0x/sdk";
import pLimit from "p-limit";

import { idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { bn, now, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import * as arweaveRelay from "@/jobs/arweave-relay";
import * as ordersUpdateById from "@/jobs/order-updates/by-id-queue";
import { Sources } from "@/models/sources";
import { DbOrder, OrderMetadata, generateSchemaHash } from "@/orderbook/orders/utils";
import { offChainCheck } from "@/orderbook/orders/looks-rare/check";
import * as commonHelpers from "@/orderbook/orders/common/helpers";
import * as tokenSet from "@/orderbook/token-sets";
import * as royalties from "@/utils/royalties";
import { Royalty } from "@/utils/royalties";
import _ from "lodash";

export type OrderInfo = {
  orderParams: Sdk.LooksRare.Types.MakerOrderParams;
  metadata: OrderMetadata;
};

type SaveResult = {
  id: string;
  status: string;
  unfillable?: boolean;
};

export const save = async (
  orderInfos: OrderInfo[],
  relayToArweave?: boolean
): Promise<SaveResult[]> => {
  const results: SaveResult[] = [];
  const orderValues: DbOrder[] = [];

  const arweaveData: {
    order: Sdk.LooksRare.Order;
    schemaHash?: string;
    source?: string;
  }[] = [];

  const handleOrder = async ({ orderParams, metadata }: OrderInfo) => {
    try {
      const order = new Sdk.LooksRare.Order(config.chainId, orderParams);
      const id = order.hash();

      // Check: order doesn't already exist
      const orderExists = await idb.oneOrNone(`SELECT 1 FROM "orders" "o" WHERE "o"."id" = $/id/`, {
        id,
      });
      if (orderExists) {
        return results.push({
          id,
          status: "already-exists",
        });
      }

      const currentTime = now();

      // Check: order has a valid listing time
      const listingTime = order.params.startTime;
      if (listingTime - 5 * 60 >= currentTime) {
        // TODO: Add support for not-yet-valid orders
        return results.push({
          id,
          status: "invalid-listing-time",
        });
      }

      // Check: order is not expired
      const expirationTime = order.params.endTime;
      if (currentTime >= expirationTime) {
        return results.push({
          id,
          status: "expired",
        });
      }

      // Check: order has Weth as payment token
      if (order.params.currency !== Sdk.Common.Addresses.Weth[config.chainId]) {
        return results.push({
          id,
          status: "unsupported-payment-token",
        });
      }

      // Check: order is valid
      try {
        order.checkValidity();
      } catch {
        return results.push({
          id,
          status: "invalid",
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
        case "contract-wide": {
          [{ id: tokenSetId }] = await tokenSet.contractWide.save([
            {
              id: `contract:${order.params.collection}`,
              schemaHash,
              contract: order.params.collection,
            },
          ]);

          break;
        }

        case "single-token": {
          [{ id: tokenSetId }] = await tokenSet.singleToken.save([
            {
              id: `token:${order.params.collection}:${order.params.tokenId}`,
              schemaHash,
              contract: order.params.collection,
              tokenId: order.params.tokenId,
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

      const side = order.params.isOrderAsk ? "sell" : "buy";

      // Handle: currency
      let currency = order.params.currency;
      if (side === "sell" && currency === Sdk.Common.Addresses.Weth[config.chainId]) {
        // LooksRare sell orders are always in WETH (although fillable in ETH)
        currency = Sdk.Common.Addresses.Eth[config.chainId];
      }

      // Handle: fees
      let feeBreakdown = [
        {
          kind: "marketplace",
          recipient: "0x5924a28caaf1cc016617874a2f0c3710d881f3c1",
          bps: 150,
        },
      ];

      // Handle: royalties
      let eip2981Royalties: Royalty[];

      if (order.params.kind === "single-token") {
        eip2981Royalties = await royalties.getRoyalties(
          order.params.collection,
          order.params.tokenId,
          "eip2981"
        );
      } else {
        eip2981Royalties = await royalties.getRoyaltiesByTokenSet(tokenSetId, "eip2981");
      }

      if (eip2981Royalties.length) {
        feeBreakdown = [
          ...feeBreakdown,
          {
            kind: "royalty",
            recipient: eip2981Royalties[0].recipient,
            // LooksRare has fixed 0.5% royalties
            bps: 50,
          },
        ];
      }

      const price = order.params.price;

      // Handle: royalties on top
      const defaultRoyalties =
        side === "sell"
          ? await royalties.getRoyalties(order.params.collection, order.params.tokenId, "default")
          : await royalties.getRoyaltiesByTokenSet(tokenSetId, "default");

      const missingRoyalties = [];
      let missingRoyaltyAmount = bn(0);
      let royaltyDeducted = false;
      for (const { bps, recipient } of defaultRoyalties) {
        // Get any built-in royalty payment to the current recipient
        const existingRoyalty = feeBreakdown.find((r) => r.kind === "royalty");

        // Deduce the 0.5% royalty LooksRare will pay if needed
        const actualBps = existingRoyalty && !royaltyDeducted ? bps - 50 : bps;
        royaltyDeducted = !_.isUndefined(existingRoyalty) || royaltyDeducted;

        const amount = bn(price).mul(actualBps).div(10000).toString();
        missingRoyaltyAmount = missingRoyaltyAmount.add(amount);

        missingRoyalties.push({
          bps: actualBps,
          amount,
          recipient,
        });
      }

      const feeBps = feeBreakdown.map(({ bps }) => bps).reduce((a, b) => Number(a) + Number(b), 0);

      // Handle: price and value
      let value: string;
      let normalizedValue: string | undefined;
      if (side === "buy") {
        // For buy orders, we set the value as `price - fee` since it
        // is best for UX to show the user exactly what they're going
        // to receive on offer acceptance.
        value = bn(price)
          .sub(bn(price).mul(bn(feeBps)).div(10000))
          .toString();
        // The normalized value excludes the royalties from the value
        normalizedValue = bn(value).sub(missingRoyaltyAmount).toString();
      } else {
        // For sell orders, the value is the same as the price
        value = price;
        // The normalized value includes the royalties on top of the price
        normalizedValue = bn(value).add(missingRoyaltyAmount).toString();
      }

      // Handle: source
      const sources = await Sources.getInstance();
      let source = await sources.getOrInsert("looksrare.org");
      if (metadata.source) {
        source = await sources.getOrInsert(metadata.source);
      }

      // Handle: native Reservoir orders
      const isReservoir = false;

      // Handle: conduit
      let conduit = Sdk.LooksRare.Addresses.Exchange[config.chainId];
      if (side === "sell") {
        const contractKind = await commonHelpers.getContractKind(order.params.collection);
        conduit =
          contractKind === "erc721"
            ? Sdk.LooksRare.Addresses.TransferManagerErc721[config.chainId]
            : Sdk.LooksRare.Addresses.TransferManagerErc1155[config.chainId];
      }

      const validFrom = `date_trunc('seconds', to_timestamp(${order.params.startTime}))`;
      const validTo = `date_trunc('seconds', to_timestamp(${order.params.endTime}))`;
      orderValues.push({
        id,
        kind: "looks-rare",
        side,
        fillability_status: fillabilityStatus,
        approval_status: approvalStatus,
        token_set_id: tokenSetId,
        token_set_schema_hash: toBuffer(schemaHash),
        maker: toBuffer(order.params.signer),
        taker: toBuffer(AddressZero),
        price,
        value,
        currency: toBuffer(currency),
        currency_price: price,
        currency_value: value,
        needs_conversion: null,
        valid_between: `tstzrange(${validFrom}, ${validTo}, '[]')`,
        nonce: order.params.nonce,
        source_id_int: source?.id,
        is_reservoir: isReservoir ? isReservoir : null,
        contract: toBuffer(order.params.collection),
        conduit: toBuffer(conduit),
        fee_bps: feeBps,
        fee_breakdown: feeBreakdown || null,
        dynamic: null,
        raw_data: order.params,
        expiration: validTo,
        missing_royalties: missingRoyalties,
        normalized_value: normalizedValue,
        currency_normalized_value: normalizedValue,
      });

      const unfillable =
        fillabilityStatus !== "fillable" || approvalStatus !== "approved" ? true : undefined;

      results.push({
        id,
        status: "success",
        unfillable,
      });

      if (relayToArweave) {
        arweaveData.push({ order, schemaHash, source: source?.domain });
      }
    } catch (error) {
      logger.error(
        "orders-looks-rare-save",
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
        { name: "missing_royalties", mod: ":json" },
        "normalized_value",
        "currency_normalized_value",
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

    if (relayToArweave) {
      await arweaveRelay.addPendingOrdersLooksRare(arweaveData);
    }
  }

  return results;
};
