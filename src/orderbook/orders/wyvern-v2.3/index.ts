import { AddressZero } from "@ethersproject/constants";
import * as Sdk from "@reservoir0x/sdk";
import pLimit from "p-limit";

import { idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { bn, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import * as arweaveRelay from "@/jobs/arweave-relay";
import * as ordersUpdateById from "@/jobs/order-updates/by-id-queue";
import { DbOrder, OrderMetadata, generateSchemaHash } from "@/orderbook/orders/utils";
import { offChainCheck } from "@/orderbook/orders/wyvern-v2.3/check";
import { getUserProxy } from "@/orderbook/orders/wyvern-v2.3/utils";
import * as tokenSet from "@/orderbook/token-sets";
import { Sources } from "@/models/sources";

export type OrderInfo = {
  orderParams: Sdk.WyvernV23.Types.OrderParams;
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
    order: Sdk.WyvernV23.Order;
    schemaHash?: string;
    source?: string;
  }[] = [];

  const handleOrder = async ({ orderParams, metadata }: OrderInfo) => {
    try {
      const order = new Sdk.WyvernV23.Order(config.chainId, orderParams);
      const info = order.getInfo();
      const id = order.prefixHash();

      // Check: order has a valid target
      if (!info) {
        return results.push({
          id,
          status: "unknown-target",
        });
      }

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

      const currentTime = Math.floor(Date.now() / 1000);

      // Check: order has a valid listing time
      const listingTime = order.params.listingTime;
      if (listingTime - 5 * 60 >= currentTime) {
        // TODO: Add support for not-yet-valid orders
        return results.push({
          id,
          status: "invalid-listing-time",
        });
      }

      // Check: order is not expired
      const expirationTime = order.params.expirationTime;
      if (expirationTime !== 0 && currentTime >= expirationTime) {
        return results.push({
          id,
          status: "expired",
        });
      }

      // Check: order has a non-zero fee recipient
      if (order.params.feeRecipient === AddressZero) {
        return results.push({
          id,
          status: "invalid-fee-recipient",
        });
      }

      // Check: buy order has Weth as payment token
      if (
        order.params.side === 0 &&
        order.params.paymentToken !== Sdk.Common.Addresses.Weth[config.chainId]
      ) {
        return results.push({
          id,
          status: "unsupported-payment-token",
        });
      }

      // Check: sell order has Eth as payment token
      if (
        order.params.side === 1 &&
        order.params.paymentToken !== Sdk.Common.Addresses.Eth[config.chainId]
      ) {
        return results.push({
          id,
          status: "unsupported-payment-token",
        });
      }

      // Check: order is not private
      if (order.params.taker !== AddressZero) {
        return results.push({
          id,
          status: "unsupported-taker",
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

      const orderKind = order.params.kind?.split("-").slice(1).join("-");
      switch (orderKind) {
        case "contract-wide": {
          [{ id: tokenSetId }] = await tokenSet.contractWide.save([
            {
              id: `contract:${info.contract}`,
              schemaHash,
              contract: info.contract,
            },
          ]);

          break;
        }

        case "single-token": {
          const typedInfo = info as typeof info & { tokenId: string };
          const tokenId = typedInfo.tokenId;
          if (tokenId) {
            [{ id: tokenSetId }] = await tokenSet.singleToken.save([
              {
                id: `token:${info.contract}:${tokenId}`,
                schemaHash,
                contract: info.contract,
                tokenId,
              },
            ]);
          }

          break;
        }

        case "single-token-v2": {
          const typedInfo = info as typeof info & { tokenId: string };
          const tokenId = typedInfo.tokenId;
          if (tokenId) {
            [{ id: tokenSetId }] = await tokenSet.singleToken.save([
              {
                id: `token:${info.contract}:${tokenId}`,
                schemaHash,
                contract: info.contract,
                tokenId,
              },
            ]);
          }

          break;
        }

        case "token-list": {
          const typedInfo = info as typeof info & { merkleRoot: string };
          const merkleRoot = typedInfo.merkleRoot;
          if (merkleRoot) {
            [{ id: tokenSetId }] = await tokenSet.tokenList.save([
              {
                id: `list:${info.contract}:${merkleRoot}`,
                schemaHash,
                schema: metadata.schema,
              },
            ]);
          }

          break;
        }

        case "token-range": {
          const typedInfo = info as typeof info & {
            startTokenId: string;
            endTokenId: string;
          };
          const startTokenId = typedInfo.startTokenId;
          const endTokenId = typedInfo.endTokenId;
          if (startTokenId && endTokenId) {
            [{ id: tokenSetId }] = await tokenSet.tokenRange.save([
              {
                id: `range:${info.contract}:${startTokenId}:${endTokenId}`,
                schemaHash,
                contract: info.contract,
                startTokenId,
                endTokenId,
              },
            ]);
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

      const side = order.params.side === 0 ? "buy" : "sell";

      // Handle: price and value
      const price = order.getMatchingPrice().toString();
      let value: string;
      if (side === "buy") {
        // For buy orders, we set the value as `price - fee` since it
        // is best for UX to show the user exactly what they're going
        // to receive on offer acceptance.
        const fee = order.params.takerRelayerFee;
        value = bn(price)
          .sub(bn(price).mul(bn(fee)).div(10000))
          .toString();
      } else {
        // For sell orders, the value is the same as the price
        value = price;
      }

      // Handle: fees
      const feeBps = Math.max(order.params.makerRelayerFee, order.params.takerRelayerFee);

      // Handle: source and fees breakdown
      const sources = await Sources.getInstance();

      // Default source: OpenSea
      let source = "0x5b3256965e7c3cf26e11fcaf296dfc8807c01073";
      let sourceId = sources.getByName("OpenSea").id;
      let feeBreakdown: object[] = [];
      feeBreakdown = [
        {
          kind: "marketplace",
          recipient: order.params.feeRecipient,
          bps: 250,
        },
      ];
      if (feeBps > 250) {
        feeBreakdown.push({
          kind: "royalty",
          // TODO: We should extract royalties out of the associated collection
          recipient: null,
          bps: feeBps - 250,
        });
      }

      switch (order.params.feeRecipient) {
        // forgotten.market
        case "0xfdfda3d504b1431ea0fd70084b1bfa39fa99dcc4":
        case "0xcfd61fb650da1dd7b8f7bc7ad0d105b40bbd3882":
        case "0x94f0e012b7bb033f32029fbcc4f1d29ff1cfc30a":
        case "0x6be88409f2a4751aea05a3a0977cb239904fe0d6": {
          source = "0xfdfda3d504b1431ea0fd70084b1bfa39fa99dcc4";
          sourceId = sources.getByName("Forgotten Market").id;
          feeBreakdown = [
            {
              kind: "marketplace",
              recipient: order.params.feeRecipient,
              bps: 100,
            },
          ];

          if (feeBps > 100) {
            feeBreakdown.push({
              kind: "royalty",
              // TODO: We should extract royalties out of the associated collection
              recipient: null,
              bps: feeBps - 100,
            });
          }

          break;
        }

        default: {
          // If source was passed
          if (metadata.source) {
            const sourceEntity = await sources.getOrInsert(metadata.source);
            source = sourceEntity.address;
            sourceId = sourceEntity.id;

            feeBreakdown = [
              {
                kind: "royalty",
                recipient: order.params.feeRecipient,
                bps: feeBps,
              },
            ];
          }

          break;
        }
      }

      // Handle: native Reservoir orders
      let isReservoir = true;
      if (source === "0x5b3256965e7c3cf26e11fcaf296dfc8807c01073") {
        isReservoir = false;
      }

      // Handle: conduit
      const conduit = await getUserProxy(order.params.maker);
      if (!conduit) {
        throw new Error("Missing user proxy");
      }

      const validFrom = `date_trunc('seconds', to_timestamp(${order.params.listingTime}))`;
      const validTo = order.params.expirationTime
        ? `date_trunc('seconds', to_timestamp(${order.params.expirationTime}))`
        : "'infinity'";
      orderValues.push({
        id,
        kind: "wyvern-v2.3",
        side,
        fillability_status: fillabilityStatus,
        approval_status: approvalStatus,
        token_set_id: tokenSetId,
        token_set_schema_hash: toBuffer(schemaHash),
        maker: toBuffer(order.params.maker),
        taker: toBuffer(order.params.taker),
        price,
        value,
        valid_between: `tstzrange(${validFrom}, ${validTo}, '[]')`,
        nonce: order.params.nonce,
        source_id: source ? toBuffer(source) : null,
        source_id_int: sourceId,
        is_reservoir: isReservoir ? isReservoir : null,
        contract: toBuffer(info.contract),
        conduit: toBuffer(conduit),
        fee_bps: feeBps,
        fee_breakdown: feeBreakdown || null,
        dynamic: order.isDutchAuction() ? true : null,
        raw_data: order.params,
        expiration: validTo,
      });

      results.push({
        id,
        status: "success",
        unfillable:
          fillabilityStatus !== "fillable" || approvalStatus !== "approved" ? true : undefined,
      });

      if (relayToArweave) {
        arweaveData.push({ order, schemaHash, source });
      }
    } catch (error) {
      logger.error(
        "orders-wyvern-v2.3-save",
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
        { name: "valid_between", mod: ":raw" },
        "nonce",
        "source_id",
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

    if (relayToArweave) {
      await arweaveRelay.addPendingOrdersWyvernV23(arweaveData);
    }
  }

  return results;
};
