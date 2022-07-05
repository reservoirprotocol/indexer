import { AddressZero } from "@ethersproject/constants";
import * as Sdk from "@reservoir0x/sdk";
import { BaseBuildParams } from "@reservoir0x/sdk/dist/seaport/builders/base";

import { edb } from "@/common/db";
import { baseProvider } from "@/common/provider";
import { bn } from "@/common/utils";
import { config } from "@/config/index";

export interface BaseOrderBuildOptions {
  maker: string;
  contract: string;
  weiPrice: string;
  orderbook: "opensea" | "reservoir";
  quantity?: number;
  nonce?: string;
  fee?: number[];
  feeRecipient?: string[];
  listingTime?: number;
  expirationTime?: number;
  salt?: string;
  automatedRoyalties?: boolean;
  excludeFlaggedTokens?: boolean;
}

type OrderBuildInfo = {
  params: BaseBuildParams;
  kind: "erc721" | "erc1155";
};

export const getBuildInfo = async (
  options: BaseOrderBuildOptions,
  collection: string,
  side: "sell" | "buy"
): Promise<OrderBuildInfo> => {
  const collectionResult = await edb.oneOrNone(
    `
      SELECT
        contracts.kind,
        collections.royalties
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

  const buildParams: BaseBuildParams = {
    offerer: options.maker,
    side,
    tokenKind: collectionResult.kind,
    contract: options.contract,
    price: options.weiPrice,
    paymentToken:
      side === "buy"
        ? Sdk.Common.Addresses.Weth[config.chainId]
        : Sdk.Common.Addresses.Eth[config.chainId],
    fees: [],
    // Use OpenSea's pausable zone when posting to OpenSea
    zone:
      options.orderbook === "opensea"
        ? Sdk.Seaport.Addresses.PausableZone[config.chainId]
        : AddressZero,
    // OpenSea's conduit for sharing approvals
    conduitKey: "0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000",
    startTime: options.listingTime || Math.floor(Date.now() / 1000),
    endTime: options.expirationTime || Math.floor(Date.now() / 1000) + 6 * 30 * 24 * 3600,
    salt: options.salt,
    counter: (await exchange.getCounter(baseProvider, options.maker)).toString(),
  };

  // Keep track of the total amount of fees
  let totalFees = bn(0);

  if (options.automatedRoyalties) {
    // Include the royalties
    for (const { recipient, bps } of collectionResult.royalties || []) {
      if (recipient && Number(bps) > 0) {
        const fee = bn(bps).mul(options.weiPrice).div(10000).toString();
        buildParams.fees!.push({
          recipient,
          amount: fee,
        });

        totalFees = totalFees.add(fee);
      }
    }
  }

  if (options.orderbook === "opensea") {
    if (!options.fee || !options.feeRecipient) {
      options.fee = [];
      options.feeRecipient = [];
    }

    options.fee.push(250);
    // OpenSea's Seaport fee recipient
    options.feeRecipient.push("0x8de9c5a032463c561423387a9648c5c7bcc5bc90");
  }

  if (options.fee && options.feeRecipient) {
    for (let i = 0; i < options.fee.length; i++) {
      const fee = bn(options.fee[i]).mul(options.weiPrice).div(10000).toString();
      buildParams.fees!.push({
        recipient: options.feeRecipient[i],
        amount: fee,
      });
      totalFees = totalFees.add(fee);
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
