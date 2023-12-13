import { AddressZero, HashZero } from "@ethersproject/constants";
import * as Sdk from "@reservoir0x/sdk";
import _ from "lodash";
import pLimit from "p-limit";

import { idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { bn, now, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { getNetworkSettings } from "@/config/network";
import { FeeRecipients } from "@/models/fee-recipients";
import { Sources } from "@/models/sources";
import { SourcesEntity } from "@/models/sources/sources-entity";
import { DbOrder, OrderMetadata, generateSchemaHash } from "@/orderbook/orders/utils";
import { offChainCheck } from "@/orderbook/orders/seaport-base/check";
import * as tokenSet from "@/orderbook/token-sets";
import { getUSDAndNativePrices } from "@/utils/prices";
import * as royalties from "@/utils/royalties";
import {
  orderUpdatesByIdJob,
  OrderUpdatesByIdJobPayload,
} from "@/jobs/order-updates/order-updates-by-id-job";
import * as offchainCancel from "@/utils/offchain-cancel";

export type OrderInfo = {
  orderParams: Sdk.SeaportBase.Types.OrderComponents;
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

  const handleOrder = async (
    orderParams: Sdk.SeaportBase.Types.OrderComponents,
    metadata: OrderMetadata
  ) => {
    try {
      const order = new Sdk.Alienswap.Order(config.chainId, orderParams);
      const info = order.getInfo();
      const id = order.hash();

      // Check: order has a valid format
      if (!info) {
        return results.push({
          id,
          status: "invalid-format",
        });
      }

      // Check: order doesn't already exist
      const orderExists = await idb.oneOrNone(
        `
          WITH x AS (
            UPDATE orders
            SET
              raw_data = $/rawData/,
              updated_at = now()
            WHERE orders.id = $/id/
              AND raw_data IS NULL
          )
          SELECT 1 FROM orders WHERE orders.id = $/id/
        `,
        {
          id,
          rawData: order.params,
        }
      );

      if (orderExists) {
        return results.push({
          id,
          status: "already-exists",
        });
      }

      // Check: order has a supported conduit
      if (
        ![HashZero, Sdk.Alienswap.Addresses.AlienswapConduitKey[config.chainId]].includes(
          order.params.conduitKey
        )
      ) {
        return results.push({
          id,
          status: "unsupported-conduit",
        });
      }

      // Check: order has a non-zero price
      if (bn(info.price).lte(0)) {
        return results.push({
          id,
          status: "zero-price",
        });
      }

      const currentTime = now();

      // Check: order has a valid start time
      const startTime = order.params.startTime;
      if (startTime - 60 >= currentTime) {
        return results.push({
          id,
          status: "invalid-start-time",
        });
      }

      // Check: order is not expired
      const endTime = order.params.endTime;
      if (currentTime >= endTime) {
        return results.push({
          id,
          status: "expired",
        });
      }

      // Check: buy order has a supported payment token
      if (info.side === "buy" && !getNetworkSettings().supportedBidCurrencies[info.paymentToken]) {
        return results.push({
          id,
          status: "unsupported-payment-token",
        });
      }

      // Check: order is partially-fillable
      const quantityRemaining = info.amount ?? "1";
      if ([0, 2].includes(order.params.orderType) && bn(quantityRemaining).gt(1)) {
        return results.push({
          id,
          status: "not-partially-fillable",
        });
      }

      // Check: order has a known zone
      if (order.params.orderType > 1) {
        if (
          ![
            // No zone
            AddressZero,
            // Cancellation zone
            Sdk.SeaportBase.Addresses.ReservoirCancellationZone[config.chainId],
          ].includes(order.params.zone)
        ) {
          return results.push({
            id,
            status: "unsupported-zone",
          });
        }
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
        await order.checkSignature(baseProvider);
      } catch {
        return results.push({
          id,
          status: "invalid-signature",
        });
      }

      // Check: order fillability
      let fillabilityStatus = "fillable";
      let approvalStatus = "approved";
      const exchange = new Sdk.Alienswap.Exchange(config.chainId);
      try {
        await offChainCheck(order, "alienswap", exchange, {
          onChainApprovalRecheck: true,
          singleTokenERC721ApprovalCheck: metadata.fromOnChain,
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
          const typedInfo = info as typeof info & { tokenId: string };
          const tokenId = typedInfo.tokenId;

          tokenSetId = `token:${info.contract}:${tokenId}`;
          if (tokenId) {
            await tokenSet.singleToken.save([
              {
                id: tokenSetId,
                schemaHash,
                contract: info.contract,
                tokenId,
              },
            ]);
          }

          break;
        }

        case "contract-wide": {
          tokenSetId = `contract:${info.contract}`;
          await tokenSet.contractWide.save([
            {
              id: tokenSetId,
              schemaHash,
              contract: info.contract,
            },
          ]);

          break;
        }

        case "token-list": {
          const typedInfo = info as typeof info & { merkleRoot: string };
          const merkleRoot = typedInfo.merkleRoot;

          if (merkleRoot) {
            tokenSetId = `list:${info.contract}:${bn(merkleRoot).toHexString()}`;

            const ts = await tokenSet.tokenList.save([
              {
                id: tokenSetId,
                schemaHash,
                schema: metadata.schema,
              },
            ]);

            logger.info(
              "orders-alienswap-save",
              `TokenList. orderId=${id}, tokenSetId=${tokenSetId}, schemaHash=${schemaHash}, metadata=${JSON.stringify(
                metadata
              )}, ts=${JSON.stringify(ts)}`
            );
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
      let feeAmount = order.getFeeAmount();

      // Handle: price and value
      let price = bn(order.getMatchingPrice(Math.max(now(), startTime)));
      let value = price;
      if (info.side === "buy") {
        // For buy orders, we set the value as `price - fee` since it
        // is best for UX to show the user exactly what they're going
        // to receive on offer acceptance.
        value = bn(price).sub(feeAmount);
      }

      // The price, value and fee are for a single item
      if (bn(info.amount).gt(1)) {
        price = price.div(info.amount);
        value = value.div(info.amount);
        feeAmount = feeAmount.div(info.amount);
      }

      // Handle: royalties
      let openSeaRoyalties: royalties.Royalty[];

      if (order.params.kind === "single-token") {
        openSeaRoyalties = await royalties.getRoyalties(info.contract, info.tokenId, "", true);
      } else {
        openSeaRoyalties = await royalties.getRoyaltiesByTokenSet(tokenSetId, "", true);
      }

      let feeBps = 0;
      let knownFee = false;
      const feeRecipients = await FeeRecipients.getInstance();
      const feeBreakdown = info.fees.map(({ recipient, amount }) => {
        const bps = price.eq(0)
          ? 0
          : bn(amount)
              .div(info.amount ?? 1)
              .mul(10000)
              .div(price)
              .toNumber();

        feeBps += bps;

        // First check for opensea hardcoded recipients
        const kind: "marketplace" | "royalty" = feeRecipients.getByAddress(
          recipient.toLowerCase(),
          "marketplace"
        )
          ? "marketplace"
          : "royalty";

        // Check for unknown fees
        knownFee =
          knownFee ||
          !openSeaRoyalties.map(({ recipient }) => recipient).includes(recipient.toLowerCase()); // Check for locally stored royalties

        return {
          kind,
          recipient,
          bps,
        };
      });

      if (feeBps > 10000) {
        return results.push({
          id,
          status: "fees-too-high",
        });
      }

      // Handle: royalties on top
      const defaultRoyalties =
        info.side === "sell"
          ? await royalties.getRoyalties(info.contract, info.tokenId, "default")
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

      // Handle: source
      const sources = await Sources.getInstance();
      let source: SourcesEntity | undefined = await sources.getOrInsert("alienswap.xyz");

      // If cross posting, source should always be opensea.
      const sourceHash = bn(order.params.salt)._hex.slice(0, 10);
      const matchedSource = sources.getByDomainHash(sourceHash);
      if (matchedSource) {
        source = matchedSource;
      }

      // Handle: price conversion
      const currency = info.paymentToken;

      const currencyPrice = price.toString();
      const currencyValue = value.toString();

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

      // Handle: normalized value
      const currencyNormalizedValue =
        info.side === "sell"
          ? bn(currencyValue).add(missingRoyaltyAmount).toString()
          : bn(currencyValue).sub(missingRoyaltyAmount).toString();

      const prices = await getUSDAndNativePrices(currency, currencyNormalizedValue, currentTime);
      if (!prices.nativePrice) {
        // Getting the native price is a must
        return results.push({
          id,
          status: "failed-to-convert-price",
        });
      }
      const normalizedValue = bn(prices.nativePrice).toString();

      // Handle: off-chain cancellation via replacement
      if (
        order.params.zone === Sdk.SeaportBase.Addresses.ReservoirCancellationZone[config.chainId]
      ) {
        const replacedOrderResult = await idb.oneOrNone(
          `
            SELECT
              orders.raw_data
            FROM orders
            WHERE orders.id = $/id/
          `,
          {
            id: order.params.salt,
          }
        );
        if (
          replacedOrderResult &&
          // Replacement is only possible if the replaced order is an off-chain cancellable one
          replacedOrderResult.raw_data.zone ===
            Sdk.SeaportBase.Addresses.ReservoirCancellationZone[config.chainId]
        ) {
          await offchainCancel.seaport.doReplacement({
            newOrders: [order.params],
            replacedOrders: [replacedOrderResult.raw_data],
            orderKind: "alienswap",
          });
        }
      }

      const validFrom = `date_trunc('seconds', to_timestamp(${startTime}))`;
      const validTo = endTime
        ? `date_trunc('seconds', to_timestamp(${order.params.endTime}))`
        : "'infinity'";
      orderValues.push({
        id,
        kind: "alienswap",
        side: info.side,
        fillability_status: fillabilityStatus,
        approval_status: approvalStatus,
        token_set_id: tokenSetId,
        token_set_schema_hash: toBuffer(schemaHash),
        maker: toBuffer(order.params.offerer),
        taker: toBuffer(info.taker),
        price: price.toString(),
        value: value.toString(),
        currency: toBuffer(info.paymentToken),
        currency_price: currencyPrice.toString(),
        currency_value: currencyValue.toString(),
        needs_conversion: needsConversion,
        quantity_remaining: quantityRemaining,
        valid_between: `tstzrange(${validFrom}, ${validTo}, '[]')`,
        nonce: bn(order.params.counter).toString(),
        source_id_int: source?.id,
        is_reservoir: null,
        contract: toBuffer(info.contract),
        conduit: toBuffer(
          new Sdk.Alienswap.Exchange(config.chainId).deriveConduit(order.params.conduitKey)
        ),
        fee_bps: feeBps,
        fee_breakdown: feeBreakdown || null,
        dynamic: info.isDynamic ?? null,
        raw_data: order.params,
        expiration: validTo,
        missing_royalties: missingRoyalties,
        normalized_value: normalizedValue,
        currency_normalized_value: currencyNormalizedValue,
        originated_at: metadata.originatedAt ?? null,
      });

      const unfillable =
        fillabilityStatus !== "fillable" ||
        approvalStatus !== "approved" ||
        // Skip private orders
        info.taker !== AddressZero
          ? true
          : undefined;

      results.push({
        id,
        status: "success",
        unfillable,
      });
    } catch (error) {
      logger.warn(
        "orders-alienswap-save",
        `Failed to handle order with params ${JSON.stringify(orderParams)}: ${error}`
      );
    }
  };

  // Process all orders concurrently
  const limit = pLimit(20);
  await Promise.all(
    orderInfos.map((orderInfo) =>
      limit(async () =>
        handleOrder(
          orderInfo.orderParams as Sdk.SeaportBase.Types.OrderComponents,
          orderInfo.metadata
        )
      )
    )
  );

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
  }

  return results;
};
