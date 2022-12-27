import * as Sdk from "@reservoir0x/sdk";
import { generateMerkleTree } from "@reservoir0x/sdk/dist/common/helpers/merkle";
import pLimit from "p-limit";

import { idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { bn, now, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { Sources } from "@/models/sources";
import { offChainCheck } from "@/orderbook/orders/infinity/check";
import { DbOrder, generateSchemaHash, OrderMetadata } from "@/orderbook/orders/utils";
import * as tokenSet from "@/orderbook/token-sets";

import * as arweaveRelay from "@/jobs/arweave-relay";
import * as ordersUpdateById from "@/jobs/order-updates/by-id-queue";

export type OrderInfo = {
  orderParams: Sdk.Infinity.Types.OrderInput;
  metadata: OrderMetadata;
};

type SaveResult = {
  id: string;
  status: string;
  unfillable?: boolean;
};

export const save = async (orderInfos: OrderInfo[], relayToArweave?: boolean) => {
  const results: SaveResult[] = [];
  const orderValues: DbOrder[] = [];

  const arweaveData: {
    order: Sdk.Infinity.Order;
    schemaHash?: string;
    source?: string;
  }[] = [];

  const handleOrder = async ({ orderParams, metadata }: OrderInfo) => {
    try {
      const order = new Sdk.Infinity.Order(config.chainId, orderParams);
      const id = order.hash();

      try {
        order.checkValidity();
      } catch (err) {
        return results.push({ id, status: "invalid-format" });
      }

      const orderExists = await checkOrderExistence(id);
      if (orderExists) {
        return results.push({
          id,
          status: "already-exists",
        });
      }

      const currentTime = now();
      const orderExpires = order.endTime !== 0;
      // Check: order is not expired
      if (orderExpires && currentTime >= order.endTime) {
        return results.push({
          id,
          status: "expired",
        });
      }

      // Check: listings are in ETH and offers are in WETH
      if (order.isSellOrder && order.params.currency !== Sdk.Common.Addresses.Eth[config.chainId]) {
        return results.push({
          id,
          status: "unsupported-payment-token",
        });
      } else if (
        !order.isSellOrder &&
        order.params.currency !== Sdk.Common.Addresses.Weth[config.chainId]
      ) {
        return results.push({
          id,
          status: "unsupported-payment-token",
        });
      }

      if (order.nfts.length > 1) {
        return results.push({
          id,
          status: "unsupported-order-type",
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

      let collection: string;
      switch (order.kind) {
        case "single-token": {
          const nft = order.nfts[0];
          const tokenId = nft.tokens[0].tokenId;
          collection = nft.collection;

          [{ id: tokenSetId }] = await tokenSet.singleToken.save([
            {
              id: `token:${collection}:${tokenId}`,
              schemaHash,
              contract: collection,
              tokenId: tokenId,
            },
          ]);

          break;
        }

        case "contract-wide": {
          const nft = order.nfts[0];
          collection = nft.collection;

          [{ id: tokenSetId }] = await tokenSet.contractWide.save([
            {
              id: `contract:${collection}`,
              schemaHash,
              contract: collection,
            },
          ]);

          break;
        }

        case "complex": {
          const nfts = order.nfts;
          if (nfts.length === 1) {
            collection = nfts[0].collection;

            const merkleRoot = generateMerkleTree(nfts[0].tokens.map((t) => t.tokenId));
            if (merkleRoot) {
              [{ id: tokenSetId }] = await tokenSet.tokenList.save([
                {
                  id: `list:${collection}:${merkleRoot.getHexRoot()}`,
                  schemaHash,
                  schema: metadata.schema,
                },
              ]);
            }
          } else {
            // TODO: Add support for more complex orders once multi-collection token sets are supported
            return results.push({
              id,
              status: "unsupported-order-type",
            });
          }

          break;
        }
      }

      if (!tokenSetId) {
        return results.push({
          id,
          status: "invalid-token-set",
        });
      }

      const side = order.isSellOrder ? "sell" : "buy";

      // Handle: fees
      const FEE_BPS = 250;
      const feeBreakdown = [
        {
          kind: "marketplace",
          recipient: Sdk.Infinity.Addresses.Exchange[config.chainId],
          bps: FEE_BPS,
        },
      ];

      let price = order.getMatchingPrice();
      let feeAmount = bn(price).mul(FEE_BPS).div(10000);
      // For buy orders, we set the value as `price - fee` since it
      // is best for UX to show the user exactly what they're going
      // to receive on offer acceptance.
      let value = side === "buy" ? bn(price).sub(feeAmount) : price;

      if (order.numItems > 1) {
        price = bn(price).div(order.numItems);
        value = bn(value).div(order.numItems);
        feeAmount = bn(feeAmount).div(order.numItems);
      }

      // Handle: source
      const sources = await Sources.getInstance();
      let source = await sources.getOrInsert("infinity.xyz");
      if (metadata.source) {
        source = await sources.getOrInsert(metadata.source);
      }

      const validFrom = `date_trunc('seconds', to_timestamp(${order.startTime}))`;
      const validTo =
        order.endTime === 0
          ? "'infinity'"
          : `date_trunc('seconds', to_timestamp(${order.endTime}))`;

      const isReservoir = false;
      orderValues.push({
        id,
        kind: "infinity",
        side,
        fillability_status: fillabilityStatus,
        approval_status: approvalStatus,
        token_set_id: tokenSetId,
        token_set_schema_hash: toBuffer(schemaHash),
        offer_bundle_id: null,
        consideration_bundle_id: null,
        bundle_kind: null,
        maker: toBuffer(order.signer),
        taker: toBuffer(order.taker),
        price: price.toString(),
        value: value.toString(),
        currency: toBuffer(order.currency),
        currency_price: price.toString(),
        currency_value: value.toString(),
        needs_conversion: null,
        quantity_remaining: order.numItems.toString(),
        valid_between: `tstzrange(${validFrom}, ${validTo}, '[]')`,
        nonce: order.nonce,
        source_id_int: source?.id,
        is_reservoir: isReservoir,
        contract: toBuffer(collection),
        conduit: toBuffer(Sdk.Infinity.Addresses.Exchange[config.chainId]),
        fee_bps: FEE_BPS,
        fee_breakdown: feeBreakdown,
        dynamic: order.startPrice !== order.endPrice,
        raw_data: order.getSignedOrder(),
        expiration: validTo,
        missing_royalties: null,
        normalized_value: null,
        currency_normalized_value: null,
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
        "orders-infinity-save",
        `Failed to handle order with params ${JSON.stringify(orderParams)}: ${error}`
      );
    }
  };

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
        "offer_bundle_id",
        "consideration_bundle_id",
        "bundle_kind",
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
      await arweaveRelay.addPendingOrdersInfinity(arweaveData);
    }
  }

  return results;
};

const checkOrderExistence = async (id: string) => {
  const orderExists = await idb.oneOrNone(`SELECT 1 FROM orders WHERE orders.id = $/id/`, {
    id,
  });
  return orderExists ? true : false;
};
