import { BigNumberish, BigNumber } from "@ethersproject/bignumber";
import * as Sdk from "@reservoir0x/sdk";
import { generateMerkleTree } from "@reservoir0x/sdk/dist/common/helpers/merkle";
import pLimit from "p-limit";

import { idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { bn, now, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import {
  OrderUpdatesByIdJobPayload,
  orderUpdatesByIdJob,
} from "@/jobs/order-updates/order-updates-by-id-job";
import { Sources } from "@/models/sources";
import * as commonHelpers from "@/orderbook/orders/common/helpers";
import { DbOrder, OrderMetadata, generateSchemaHash } from "@/orderbook/orders/utils";
import { offChainCheck } from "@/orderbook/orders/zeroex-v4/check";
import * as tokenSet from "@/orderbook/token-sets";
import { getUSDAndNativePrices } from "@/utils/prices";

export type OrderInfo = {
  orderParams: Sdk.ZeroExV4.Types.BaseOrder;
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

  const handleOrder = async ({ orderParams, metadata }: OrderInfo) => {
    try {
      const order = new Sdk.ZeroExV4.Order(config.chainId, orderParams);
      const id = order.hash();

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

      // Handle: get contract kind
      const kind = await commonHelpers.getContractKind(order.params.nft);
      if (!kind) {
        return results.push({
          id,
          status: "unknown-order-kind",
        });
      }

      // Handle: fix order kind
      const underlyingOrderKind = order.params.kind!;
      if (kind !== underlyingOrderKind.split("-")[0]) {
        // There is no way to differentiate between ERC721 and ERC1155
        // orders so here we just use the kind of the target contract.
        // At the SDK, level we differentiate ERC721 and ERC1155 logic
        // by assuming that any orders that have the `nftAmount` field
        // set are ERC1155 orders. Below we just enforce this.
        if (kind === "erc1155") {
          order.params.kind = ("erc1155-" +
            underlyingOrderKind.split("-").slice(1).join("-")) as Sdk.ZeroExV4.Types.OrderKind;
          order.params.nftAmount = order.params.nftAmount ?? "1";
        } else {
          order.params.kind = ("erc721-" +
            underlyingOrderKind.split("-").slice(1).join("-")) as Sdk.ZeroExV4.Types.OrderKind;
          order.params.nftAmount = undefined;
        }
      }

      // Check: order has unique nonce
      if (kind === "erc1155") {
        // For erc1155, enforce uniqueness of maker/nonce/contract/price
        const nonceExists = await idb.oneOrNone(
          `
            SELECT 1 FROM orders
            WHERE orders.kind = 'zeroex-v4-erc1155'
              AND orders.maker = $/maker/
              AND orders.nonce = $/nonce/
              AND orders.contract = $/contract/
              AND (orders.raw_data ->> 'erc20TokenAmount')::NUMERIC / (orders.raw_data ->> 'nftAmount')::NUMERIC = $/price/
          `,
          {
            maker: toBuffer(order.params.maker),
            nonce: order.params.nonce,
            contract: toBuffer(order.params.nft),
            price: bn(order.params.erc20TokenAmount).div(order.params.nftAmount!).toString(),
          }
        );
        if (nonceExists) {
          return results.push({
            id,
            status: "duplicated-nonce",
          });
        }
      } else {
        // For erc721, enforce uniqueness of maker/nonce/contract/price
        const nonceExists = await idb.oneOrNone(
          `
            SELECT 1 FROM orders
            WHERE orders.kind = 'zeroex-v4-erc721'
              AND orders.maker = $/maker/
              AND orders.nonce = $/nonce/
              AND orders.contract = $/contract/
              AND (orders.raw_data ->> 'erc20TokenAmount')::NUMERIC = $/price/
          `,
          {
            maker: toBuffer(order.params.maker),
            nonce: order.params.nonce,
            contract: toBuffer(order.params.nft),
            price: order.params.erc20TokenAmount,
          }
        );
        if (nonceExists) {
          return results.push({
            id,
            status: "duplicated-nonce",
          });
        }
      }

      const currentTime = now();

      // Check: order is not expired
      const expirationTime = order.params.expiry;
      if (currentTime >= expirationTime) {
        return results.push({
          id,
          status: "expired",
        });
      }

      // Check: buy order has WNative as payment token
      if (
        order.params.direction === Sdk.ZeroExV4.Types.TradeDirection.BUY &&
        order.params.erc20Token !== Sdk.Common.Addresses.WNative[config.chainId]
      ) {
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
        if (!order.params.cbOrderId) {
          order.checkSignature();
        }
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

      const info = order.getInfo();
      if (!info) {
        return results.push({
          id,
          status: "unknown-info",
        });
      }

      const orderKind = order.params.kind?.split("-").slice(1).join("-");
      switch (orderKind) {
        case "contract-wide": {
          [{ id: tokenSetId }] = await tokenSet.contractWide.save([
            {
              id: `contract:${order.params.nft}`,
              schemaHash,
              contract: order.params.nft,
            },
          ]);

          break;
        }

        case "single-token": {
          [{ id: tokenSetId }] = await tokenSet.singleToken.save([
            {
              id: `token:${order.params.nft}:${order.params.nftId}`,
              schemaHash,
              contract: order.params.nft,
              tokenId: order.params.nftId,
            },
          ]);

          break;
        }

        case "token-range": {
          const typedInfo = info as typeof info & {
            startTokenId: BigNumber;
            endTokenId: BigNumber;
          };
          const startTokenId = typedInfo.startTokenId.toString();
          const endTokenId = typedInfo.endTokenId.toString();

          if (startTokenId && endTokenId) {
            [{ id: tokenSetId }] = await tokenSet.tokenRange.save([
              {
                id: `range:${order.params.nft}:${startTokenId}:${endTokenId}`,
                schemaHash,
                contract: order.params.nft,
                startTokenId,
                endTokenId,
              },
            ]);
          }

          break;
        }

        case "token-list-bit-vector":
        case "token-list-packed-list": {
          const typedInfo = info as typeof info & {
            tokenIds: BigNumberish[];
          };
          const tokenIds = typedInfo.tokenIds;

          const merkleRoot = generateMerkleTree(tokenIds);
          if (merkleRoot) {
            [{ id: tokenSetId }] = await tokenSet.tokenList.save([
              {
                id: `list:${order.params.nft}:${merkleRoot.getHexRoot()}`,
                schemaHash,
                schema: metadata.schema,
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

      // Handle: fees
      const feeAmount = order.getFeeAmount();

      const side =
        order.params.direction === Sdk.ZeroExV4.Types.TradeDirection.BUY ? "buy" : "sell";

      // Handle: price and value
      let currencyPrice = bn(order.params.erc20TokenAmount).add(feeAmount);
      let currencyValue = currencyPrice;
      if (side === "buy") {
        // For buy orders, we set the value as `price - fee` since it
        // is best for UX to show the user exactly what they're going
        // to receive on offer acceptance.
        currencyValue = bn(currencyPrice).sub(feeAmount);
      }

      // The price and value are for a single item
      if (order.params.kind?.startsWith("erc1155")) {
        currencyPrice = currencyPrice.div(order.params.nftAmount!);
        currencyValue = currencyValue.div(order.params.nftAmount!);
      }

      const feeBps = currencyPrice.eq(0) ? bn(0) : feeAmount.mul(10000).div(currencyPrice);
      if (feeBps.gt(10000)) {
        return results.push({
          id,
          status: "fees-too-high",
        });
      }

      // Handle: currency
      let currency = order.params.erc20Token;
      if (currency === Sdk.ZeroExV4.Addresses.Native[config.chainId]) {
        // ZeroEx-like exchanges use a non-standard ETH address
        currency = Sdk.Common.Addresses.Native[config.chainId];
      }

      let price = currencyPrice;
      let value = currencyValue;

      let needsConversion = false;
      if (
        ![
          Sdk.Common.Addresses.Native[config.chainId],
          Sdk.Common.Addresses.WNative[config.chainId],
        ].includes(currency)
      ) {
        needsConversion = true;

        // If the currency is anything other than ETH/WETH, we convert
        // `price` and `value` from that currency denominations to the
        // ETH denomination
        {
          const prices = await getUSDAndNativePrices(currency, price.toString(), currentTime);
          if (!prices.nativePrice) {
            // Getting the native price is a must
            return results.push({
              id,
              status: "failed-to-convert-price",
            });
          }
          price = bn(prices.nativePrice);
        }
        {
          const prices = await getUSDAndNativePrices(currency, value.toString(), currentTime);
          if (!prices.nativePrice) {
            // Getting the native price is a must
            return results.push({
              id,
              status: "failed-to-convert-price",
            });
          }
          value = bn(prices.nativePrice);
        }
      }

      // Handle: source
      const sources = await Sources.getInstance();
      let source = metadata.source ? await sources.getOrInsert(metadata.source) : undefined;

      // If we have cbOrderId this is a coinbase order
      if (order.params.cbOrderId) {
        source = await sources.getOrInsert("nft.coinbase.com");
      }

      // Handle: native Reservoir orders
      const isReservoir = true;

      // Handle: fee breakdown
      const feeBreakdown = order.params.fees.map(({ recipient, amount }) => ({
        kind: "royalty",
        recipient,
        bps: price.eq(0) ? 0 : bn(amount).mul(10000).div(price).toNumber(),
      }));

      const validFrom = `date_trunc('seconds', to_timestamp(${currentTime}))`;
      const validTo = `date_trunc('seconds', to_timestamp(${order.params.expiry}))`;
      orderValues.push({
        id,
        kind: kind === "erc1155" ? "zeroex-v4-erc1155" : "zeroex-v4-erc721",
        side,
        fillability_status: fillabilityStatus,
        approval_status: approvalStatus,
        token_set_id: tokenSetId,
        token_set_schema_hash: toBuffer(schemaHash),
        maker: toBuffer(order.params.maker),
        taker: toBuffer(order.params.taker),
        price: price.toString(),
        value: value.toString(),
        currency: toBuffer(currency),
        currency_price: currencyPrice.toString(),
        currency_value: currencyValue.toString(),
        needs_conversion: needsConversion,
        quantity_remaining: order.params.nftAmount || "1",
        valid_between: `tstzrange(${validFrom}, ${validTo}, '[]')`,
        nonce: order.params.nonce,
        source_id_int: source?.id,
        is_reservoir: isReservoir ? isReservoir : null,
        contract: toBuffer(order.params.nft),
        conduit: toBuffer(Sdk.ZeroExV4.Addresses.Exchange[config.chainId]),
        fee_bps: feeBps.toNumber(),
        fee_breakdown: feeBreakdown || null,
        dynamic: null,
        raw_data: order.params,
        expiration: validTo,
        missing_royalties: null,
        normalized_value: null,
        currency_normalized_value: null,
        originated_at: metadata.originatedAt || null,
      });

      const unfillable =
        fillabilityStatus !== "fillable" || approvalStatus !== "approved" ? true : undefined;

      results.push({
        id,
        status: "success",
        unfillable,
      });
    } catch (error) {
      logger.error(
        "orders-zeroex-v4-save",
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
  }

  return results;
};
