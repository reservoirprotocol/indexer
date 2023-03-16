import { AddressZero, HashZero } from "@ethersproject/constants";
import * as Sdk from "@reservoir0x/sdk";
import { BaseBuildParams } from "@reservoir0x/sdk/dist/seaport/builders/base";
import { generateSourceBytes, getRandomBytes } from "@reservoir0x/sdk/dist/utils";

import { redb } from "@/common/db";
import { baseProvider } from "@/common/provider";
import { bn, fromBuffer, now } from "@/common/utils";
import { config } from "@/config/index";
import { tryGetCollectionOpenseaFees } from "@/utils/opensea";
import { Tokens } from "@/models/tokens";
import * as marketplaceFees from "@/utils/marketplace_fees";
import { logger } from "@/common/logger";
import { MarketPlaceFee } from "@/utils/marketplace_fees";
import { redis } from "@/common/redis";
import * as collectionUpdatesMetadata from "@/jobs/collection-updates/metadata-queue";

export interface BaseOrderBuildOptions {
  maker: string;
  contract?: string;
  weiPrice: string;
  orderbook: "opensea" | "reservoir";
  orderType?: Sdk.Seaport.Types.OrderType;
  currency?: string;
  quantity?: number;
  nonce?: string;
  fee?: number[];
  feeRecipient?: string[];
  listingTime?: number;
  expirationTime?: number;
  salt?: string;
  automatedRoyalties?: boolean;
  royaltyBps?: number;
  excludeFlaggedTokens?: boolean;
  source?: string;
}

type OrderBuildInfo = {
  params: BaseBuildParams;
  kind: "erc721" | "erc1155";
};

export const padSourceToSalt = (source: string, salt: string) => {
  const sourceHash = generateSourceBytes(source);
  const saltHex = bn(salt)._hex.slice(6);
  return bn(`0x${sourceHash}${saltHex}`).toString();
};

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

  const exchange = new Sdk.Seaport.Exchange(config.chainId);
  const source = options.orderbook === "opensea" ? "opensea.io" : options.source;

  const buildParams: BaseBuildParams = {
    offerer: options.maker,
    side,
    tokenKind: collectionResult.kind,
    // TODO: Fix types
    contract: options.contract!,
    price: options.weiPrice,
    amount: options.quantity,
    paymentToken: options.currency
      ? options.currency
      : side === "buy"
      ? Sdk.Common.Addresses.Weth[config.chainId]
      : Sdk.Common.Addresses.Eth[config.chainId],
    fees: [],
    // Use OpenSea's pausable zone when posting to OpenSea
    zone:
      options.orderbook === "opensea"
        ? Sdk.Seaport.Addresses.PausableZone[config.chainId] ?? AddressZero
        : AddressZero,
    // Use OpenSea's conduit for sharing approvals (where available)
    conduitKey: Sdk.Seaport.Addresses.OpenseaConduitKey[config.chainId] ?? HashZero,
    startTime: options.listingTime || now() - 1 * 60,
    endTime: options.expirationTime || now() + 6 * 30 * 24 * 3600,
    salt: source
      ? padSourceToSalt(source, options.salt ?? getRandomBytes(16).toString())
      : undefined,
    counter: (await exchange.getCounter(baseProvider, options.maker)).toString(),
    orderType: options.orderType,
  };

  // Keep track of the total amount of fees
  let totalFees = bn(0);

  // Include royalties
  let totalBps = 0;
  if (options.automatedRoyalties) {
    const royalties: { bps: number; recipient: string }[] =
      (options.orderbook === "opensea"
        ? collectionResult.new_royalties?.opensea
        : collectionResult.royalties) ?? [];

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
          totalBps += bps;

          const fee = bn(bps).mul(options.weiPrice).div(10000).toString();
          buildParams.fees!.push({
            recipient: r.recipient,
            amount: fee,
          });

          totalFees = totalFees.add(fee);
        }
      }
    }
  }

  if (options.orderbook === "opensea") {
    if (!options.fee || !options.feeRecipient) {
      options.fee = [];
      options.feeRecipient = [];
    }

    let openseaMarketplaceFees: { bps: number; recipient: string }[] =
      collectionResult.marketplace_fees?.opensea;

    if (collectionResult.marketplace_fees?.opensea == null) {
      openseaMarketplaceFees = await getCollectionOpenseaFees(
        collection,
        fromBuffer(collectionResult.contract),
        totalBps
      );

      logger.info(
        "getCollectionOpenseaFees",
        `From api. collection=${collection}, openseaMarketplaceFees=${JSON.stringify(
          openseaMarketplaceFees
        )}`
      );
    } else {
      logger.info(
        "getCollectionOpenseaFees",
        `From db. collection=${collection}, openseaMarketplaceFees=${JSON.stringify(
          openseaMarketplaceFees
        )}`
      );
    }

    for (const openseaMarketplaceFee of openseaMarketplaceFees) {
      options.fee.push(openseaMarketplaceFee.bps);
      options.feeRecipient.push(openseaMarketplaceFee.recipient);
    }

    // Refresh opensea fees
    if (
      (await redis.set(
        `refresh-collection-opensea-fees:${collection}`,
        now(),
        "EX",
        3600,
        "NX"
      )) === "OK"
    ) {
      logger.info(
        "getCollectionOpenseaFees",
        `refresh fees. collection=${collection}, openseaMarketplaceFees=${JSON.stringify(
          openseaMarketplaceFees
        )}`
      );

      try {
        const tokenId = await Tokens.getSingleToken(collectionResult.id);

        await collectionUpdatesMetadata.addToQueue(
          fromBuffer(collectionResult.contract),
          tokenId,
          collectionResult.community
        );
      } catch {
        // Skip errors
      }
    }
  }

  if (options.fee && options.feeRecipient) {
    for (let i = 0; i < options.fee.length; i++) {
      if (Number(options.fee[i]) > 0) {
        const fee = bn(options.fee[i]).mul(options.weiPrice).div(10000).toString();
        buildParams.fees!.push({
          recipient: options.feeRecipient[i],
          amount: fee,
        });
        totalFees = totalFees.add(fee);
      }
    }
  }

  // If the order is a listing, subtract the fees from the price.
  // Otherwise, keep them (since the taker will pay them from the
  // amount received from the maker).
  if (side === "sell") {
    buildParams.price = bn(buildParams.price).sub(totalFees);
  } else {
    buildParams.price = bn(buildParams.price);
  }

  return {
    params: buildParams,
    kind: collectionResult.kind,
  };
};

export const getCollectionOpenseaFees = async (
  collection: string,
  contract: string,
  totalBps: number
) => {
  const openseaMarketplaceFees: MarketPlaceFee[] = [];

  const tokenId = await Tokens.getSingleToken(collection);
  const tryGetCollectionOpenseaFeesResult = await tryGetCollectionOpenseaFees(contract, tokenId);

  if (tryGetCollectionOpenseaFeesResult.isSuccess) {
    const openseaFees = tryGetCollectionOpenseaFeesResult.openseaFees;

    for (const [feeRecipient, feeBps] of Object.entries(openseaFees)) {
      openseaMarketplaceFees.push({ recipient: feeRecipient, bps: feeBps });
    }

    await marketplaceFees.updateMarketplaceFeeSpec(
      collection,
      "opensea",
      openseaMarketplaceFees as MarketPlaceFee[]
    );
  } else if (totalBps < 50) {
    openseaMarketplaceFees.push({
      recipient: "0x0000a26b00c1f0df003000390027140000faa719",
      bps: 50 - totalBps,
    });
  }

  return openseaMarketplaceFees;
};
