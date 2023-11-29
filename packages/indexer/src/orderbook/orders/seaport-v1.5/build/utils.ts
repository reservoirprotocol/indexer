import { AddressZero, HashZero } from "@ethersproject/constants";
import * as Sdk from "@reservoir0x/sdk";
import { getRandomBytes } from "@reservoir0x/sdk/dist/utils";

import { redb } from "@/common/db";
import { baseProvider } from "@/common/provider";
import { bn, fromBuffer, now } from "@/common/utils";
import { config } from "@/config/index";
import {
  BaseOrderBuildOptions,
  OrderBuildInfo,
  padSourceToSalt,
} from "@/orderbook/orders/seaport-base/build/utils";
import * as erc721c from "@/utils/erc721c";
import * as marketplaceFees from "@/utils/marketplace-fees";
import * as registry from "@/utils/royalties/registry";

export const getBuildInfo = async (
  options: BaseOrderBuildOptions,
  collection: string,
  side: "sell" | "buy"
): Promise<OrderBuildInfo> => {
  const collectionResult = await redb.oneOrNone(
    `
      SELECT
        contracts.kind,
        collections.royalties,
        collections.new_royalties,
        collections.marketplace_fees,
        collections.contract
      FROM collections
      JOIN contracts
        ON collections.contract = contracts.address
      WHERE collections.id = $/collection/
      LIMIT 1
    `,
    { collection }
  );
  if (!collectionResult) {
    throw new Error("Could not fetch collection");
  }

  const exchange = new Sdk.SeaportV15.Exchange(config.chainId);

  // Priority of conduits:
  // - requested conduit
  // - opensea conduit
  // - reservoir conduit
  // - no conduit (exchange address)
  const conduitKey =
    options.conduitKey ??
    Sdk.SeaportBase.Addresses.OpenseaConduitKey[config.chainId] ??
    Sdk.SeaportBase.Addresses.ReservoirConduitKey[config.chainId] ??
    HashZero;

  // LooksRare requires their source in the salt
  if (options.orderbook === "looks-rare") {
    options.source = "looksrare.org";
  }

  // Check if is blocked by ERC721c
  const isBlocked = await erc721c.checkMarketplaceIsFiltered(
    fromBuffer(collectionResult.contract),
    [exchange.deriveConduit(conduitKey)]
  );
  if (isBlocked) {
    throw new Error("Blocked by ERC721C security policy");
  }

  // Generate the salt
  let salt = bn(
    padSourceToSalt(options.salt ?? getRandomBytes(16).toString(), options.source)
  ).toHexString();

  // No zone by default
  let zone = AddressZero;
  if (options.useOffChainCancellation) {
    if (options.orderbook === "opensea") {
      throw new Error("Off-chain cancellation not supported when cross-posting to OpenSea");
    }

    zone = Sdk.SeaportBase.Addresses.ReservoirCancellationZone[config.chainId];
    if (options.replaceOrderId) {
      salt = options.replaceOrderId;
    }
  }

  const buildParams: Sdk.SeaportBase.BaseBuildParams = {
    offerer: options.maker,
    taker: options.taker,
    side,
    tokenKind: collectionResult.kind,
    // TODO: Fix types
    contract: options.contract!,
    price: options.weiPrice,
    endPrice: options.endWeiPrice,
    amount: options.quantity,
    paymentToken: options.currency
      ? options.currency
      : side === "buy"
      ? Sdk.Common.Addresses.WNative[config.chainId]
      : Sdk.Common.Addresses.Native[config.chainId],
    fees: [],
    zone,
    conduitKey,
    salt,
    startTime: options.listingTime || now() - 1 * 60,
    endTime: options.expirationTime || now() + 6 * 30 * 24 * 3600,
    counter: (await exchange.getCounter(baseProvider, options.maker)).toString(),
    orderType: options.orderType,
  };

  // Keep track of the total amount of fees
  let totalFees = bn(0);
  let totalEndFees = bn(0);

  // Include royalties
  if (options.automatedRoyalties && options.orderbook !== "looks-rare") {
    let royalties: { bps: number; recipient: string }[] =
      (options.orderbook === "opensea"
        ? collectionResult.new_royalties?.opensea
        : collectionResult.royalties) ?? [];

    // OpenSea hasn't adopted per-token royalties yet
    if (options.orderbook !== "opensea") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tokenId = (options as any)["tokenId"];
      if (tokenId !== undefined) {
        const tokenRoyalties = await registry.getRegistryRoyalties(options.contract!, tokenId);
        if (tokenRoyalties.length) {
          royalties = tokenRoyalties;
        }
      }
    }

    let royaltyBpsToPay = royalties.map(({ bps }) => bps).reduce((a, b) => a + b, 0);
    if (options.royaltyBps !== undefined) {
      // The royalty bps to pay will be min(collectionRoyaltyBps, requestedRoyaltyBps)
      royaltyBpsToPay = Math.min(options.royaltyBps, royaltyBpsToPay);
    }

    for (const r of royalties) {
      if (r.recipient && r.bps > 0) {
        const bps = Math.min(royaltyBpsToPay, r.bps);
        if (bps > 0) {
          royaltyBpsToPay -= bps;

          const fee = bn(bps).mul(options.weiPrice).div(10000);
          const endFee = options.endWeiPrice
            ? bn(bps).mul(options.endWeiPrice).div(10000)
            : undefined;

          if (fee.gt(0)) {
            buildParams.fees!.push({
              recipient: r.recipient,
              amount: fee.toString(),
              endAmount: endFee?.toString(),
            });

            totalFees = totalFees.add(fee);
            totalEndFees = totalEndFees.add(endFee ?? 0);
          }
        }
      }
    }
  }

  if (options.orderbook === "opensea") {
    if (!options.fee || !options.feeRecipient) {
      options.fee = [];
      options.feeRecipient = [];
    }

    // Get opensea marketplace fees
    let openseaMarketplaceFees: { bps: number; recipient: string }[] =
      collectionResult.marketplace_fees?.opensea;

    if (collectionResult.marketplace_fees?.opensea == null) {
      openseaMarketplaceFees = marketplaceFees.getCollectionOpenseaFees();
    }

    for (const openseaMarketplaceFee of openseaMarketplaceFees) {
      options.fee.push(openseaMarketplaceFee.bps);
      options.feeRecipient.push(openseaMarketplaceFee.recipient);
    }
  } else if (options.orderbook === "looks-rare") {
    // Override any fees
    options.fee = [50];
    options.feeRecipient = [Sdk.LooksRareV2.Addresses.ProtocolFeeRecipient[config.chainId]];
  }

  if (options.fee && options.feeRecipient) {
    for (let i = 0; i < options.fee.length; i++) {
      if (Number(options.fee[i]) > 0) {
        const fee = bn(options.fee[i]).mul(options.weiPrice).div(10000);
        const endFee = options.endWeiPrice
          ? bn(options.fee[i]).mul(options.endWeiPrice).div(10000)
          : undefined;

        if (fee.gt(0)) {
          buildParams.fees!.push({
            recipient: options.feeRecipient[i],
            amount: fee.toString(),
            endAmount: endFee?.toString(),
          });

          totalFees = totalFees.add(fee);
          totalEndFees = totalEndFees.add(endFee ?? 0);
        }
      }
    }
  }

  if (bn(buildParams.price).lte(totalFees)) {
    throw new Error("Total fees exceed price");
  }

  // If the order is a listing, subtract the fees from the price.
  // Otherwise, keep them (since the taker will pay them from the
  // amount received from the maker).
  if (side === "sell") {
    buildParams.price = bn(buildParams.price).sub(totalFees);
    if (buildParams.endPrice) {
      buildParams.endPrice = bn(buildParams.endPrice).sub(totalEndFees);
    }
  }

  return {
    params: buildParams,
    kind: collectionResult.kind,
  };
};
