import { AddressZero } from "@ethersproject/constants";
import * as Sdk from "@reservoir0x/sdk";
import pLimit from "p-limit";

import { idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { bn, now, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import * as arweaveRelay from "@/jobs/arweave-relay";
import * as ordersUpdateById from "@/jobs/order-updates/by-id-queue";
import { Sources } from "@/models/sources";
import { offChainCheck } from "@/orderbook/orders/universe/check";
import { DbOrder, OrderMetadata, generateSchemaHash } from "@/orderbook/orders/utils";
import * as tokenSet from "@/orderbook/token-sets";
import { getUSDAndNativePrices } from "@/utils/prices";
import * as royalties from "@/utils/royalties";

export type OrderInfo = {
  orderParams: Sdk.Universe.Types.Order;
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
    order: Sdk.Universe.Order;
    schemaHash?: string;
    source?: string;
  }[] = [];

  const handleOrder = async ({ orderParams, metadata }: OrderInfo) => {
    try {
      const order = new Sdk.Universe.Order(config.chainId, orderParams);
      const exchange = new Sdk.Universe.Exchange(config.chainId);

      const id = order.hashOrderKey();
      const { side } = order.getInfo()!;

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
      const listingTime = order.params.start;
      if (listingTime - 5 * 60 >= currentTime) {
        // TODO: Think about the case where we allow not yet valid order in our Marketplace Backend
        // TODO: Add support for not-yet-valid orders
        return results.push({
          id,
          status: "invalid-listing-time",
        });
      }

      // Check: order is not expired
      const expirationTime = order.params.end;
      if (currentTime >= expirationTime) {
        return results.push({
          id,
          status: "expired",
        });
      }

      const collection =
        side === "buy"
          ? order.params.take.assetType.contract!
          : order.params.make.assetType.contract!;

      const tokenId =
        side === "buy"
          ? order.params.take.assetType.tokenId!
          : order.params.make.assetType.tokenId!;

      // Handle: currency
      let currency: string;
      if (side === "sell") {
        switch (order.params.take.assetType.assetClass) {
          case "ETH":
            currency = Sdk.Common.Addresses.Eth[config.chainId];
            break;

          case "ERC20":
            currency = order.params.take.assetType.contract!.toLowerCase();
            break;

          default:
            return results.push({
              id,
              status: "undetectable-currency",
            });
        }
      } else {
        currency = order.params.make.assetType.contract!;
        if (currency !== Sdk.Common.Addresses.Weth[config.chainId]) {
          return results.push({
            id,
            status: "unsupported-payment-token",
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
        case "single-token": {
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
      }

      if (!tokenSetId) {
        return results.push({
          id,
          status: "invalid-token-set",
        });
      }

      // TODO: Handle: nft royalties
      const nftRoyalties: { bps: number; value: string }[] = [];

      // Handle: royalties
      const collectionRoyalties = await royalties.getRoyalties(collection, tokenId, "opensea");
      let feeBreakdown = collectionRoyalties.map(({ bps, recipient }) => ({
        kind: "royalty",
        recipient,
        bps,
      }));

      // Handle: marketplace fees
      const daoFee = await exchange.getDaoFee(baseProvider);
      const daoAddress = await exchange.getFeeReceiver(baseProvider);
      feeBreakdown = [
        ...feeBreakdown,
        {
          kind: "marketplace",
          recipient: daoAddress,
          bps: Number(daoFee.toString()),
        },
      ];

      // Handle: order revenueSplits
      const revenueSplits = (order.params.data.revenueSplits || []).map((split) => ({
        kind: "royalty",
        recipient: split.account,
        bps: Number(split.value),
      }));
      feeBreakdown = [...feeBreakdown, ...revenueSplits];

      const feeBps = feeBreakdown.map(({ bps }) => bps).reduce((a, b) => Number(a) + Number(b), 0);

      // Handle: price and value
      let price = side === "buy" ? order.params.make.value : order.params.take.value;
      let value = price;
      if (side === "buy") {
        // For buy orders, we set the value as `price - fee` since it
        // is best for UX to show the user exactly what they're going
        // to receive on offer acceptance.
        const nftFeeBps = nftRoyalties
          .map(({ bps }) => bps)
          .reduce((a, b) => Number(a) + Number(b), 0);
        const collectionFeeBps = collectionRoyalties
          .map(({ bps }) => bps)
          .reduce((a, b) => Number(a) + Number(b), 0);
        const daoFeeBps = Number(daoFee.toString());
        const revenueSplitFeeBps = revenueSplits
          .map(({ bps }) => bps)
          .reduce((a, b) => Number(a) + Number(b), 0);

        if (nftFeeBps) {
          value = bn(value)
            .sub(bn(value).mul(bn(nftFeeBps)).div(10000))
            .toString();
        }

        if (collectionFeeBps) {
          value = bn(value)
            .sub(bn(value).mul(bn(collectionFeeBps)).div(10000))
            .toString();
        }

        if (daoFeeBps) {
          value = bn(value)
            .sub(bn(price).mul(bn(daoFeeBps)).div(10000))
            .toString();
        }

        if (revenueSplitFeeBps) {
          value = bn(value)
            .sub(bn(price).mul(bn(revenueSplitFeeBps)).div(10000))
            .toString();
        }
      }

      // Handle: price conversion
      const currencyPrice = price.toString();
      const currencyValue = value.toString();

      let needsConversion = false;
      if (
        ![
          Sdk.Common.Addresses.Eth[config.chainId],
          Sdk.Common.Addresses.Weth[config.chainId],
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
          price = bn(prices.nativePrice).toString();
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
          value = bn(prices.nativePrice).toString();
        }
      }

      // Handle: source
      const sources = await Sources.getInstance();
      let source = await sources.getOrInsert("universe.xyz");
      if (metadata.source) {
        source = await sources.getOrInsert(metadata.source);
      }

      // Handle: native Reservoir orders
      const isReservoir = false;

      // Handle: conduit
      const conduit = Sdk.Universe.Addresses.Exchange[config.chainId];

      const validFrom = `date_trunc('seconds', to_timestamp(${order.params.start}))`;
      const validTo = `date_trunc('seconds', to_timestamp(${order.params.end}))`;

      orderValues.push({
        id,
        kind: "universe",
        side,
        fillability_status: fillabilityStatus,
        approval_status: approvalStatus,
        token_set_id: tokenSetId,
        token_set_schema_hash: toBuffer(schemaHash),
        maker: toBuffer(order.params.maker),
        taker: toBuffer(AddressZero),
        price,
        value,
        currency: toBuffer(currency),
        currency_price: currencyPrice,
        currency_value: currencyValue,
        needs_conversion: needsConversion,
        valid_between: `tstzrange(${validFrom}, ${validTo}, '[]')`,
        nonce: order.params.salt,
        source_id_int: source?.id,
        is_reservoir: isReservoir ? isReservoir : null,
        contract: toBuffer(collection),
        conduit: toBuffer(conduit),
        fee_bps: feeBps,
        fee_breakdown: feeBreakdown || null,
        dynamic: null,
        raw_data: order.params,
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
        "orders-universe-save",
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
      await arweaveRelay.addPendingOrdersUniverse(arweaveData);
    }
  }

  return results;
};
