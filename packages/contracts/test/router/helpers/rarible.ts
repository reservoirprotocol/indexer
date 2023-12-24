import { BigNumberish } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import * as Sdk from "@reservoir0x/sdk/src";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { ethers } from "hardhat";

import { getChainId, getCurrentTimestamp, getRandomBoolean } from "../../utils";

// --- Listings ---

export interface IPart {
  account: string;
  value: string;
}

export enum ORDER_DATA_TYPES {
  DEFAULT_DATA_TYPE = "0xffffffff",
  LEGACY = "LEGACY",
  V1 = "V1",
  API_V1 = "ETH_RARIBLE_V1",
  V2 = "V2",
  API_V2 = "ETH_RARIBLE_V2",
  V3_SELL = "V3_SELL",
  API_V3_SELL = "ETH_RARIBLE_V2_DATA_V3_SELL",
  V3_BUY = "V3_BUY",
  API_V3_BUY = "ETH_RARIBLE_V2_DATA_V3_BUY",
}

export enum ORDER_TYPES {
  V1 = "RARIBLE_V1",
  V2 = "RARIBLE_V2",
}

export type OrderKind = "single-token" | "contract-wide";

export type RaribleListing = {
  maker: SignerWithAddress;
  nft: {
    kind: "erc721" | "erc1155";
    contract: Contract;
    id: number;
    amount: number;
  };
  paymentToken?: string;
  price: BigNumberish;
  // Whether the order is to be cancelled
  isCancelled?: boolean;
  order?: Sdk.Rarible.Order;
  side: "buy" | "sell";
  fees?: {
    recipient: string;
    amount: BigNumberish;
  }[];
};

export interface IV3OrderSellData {
  "@type"?: string;
  dataType: ORDER_DATA_TYPES;
  payouts: IPart;
  originFeeFirst: IPart;
  originFeeSecond: IPart;
  maxFeesBasePoint: number;
  marketplaceMarker: string;
}

export interface IV3OrderBuyData {
  "@type"?: string;
  dataType: ORDER_DATA_TYPES;
  payouts: IPart;
  originFeeFirst: IPart;
  originFeeSecond: IPart;
  marketplaceMarker: string;
}

export type LocalAssetType = {
  assetClass: string;
  contract: Contract;
  tokenId: string;
  uri?: string;
  supply?: string;
  creators?: IPart[];
  royalties?: IPart[];
  signatures?: string[];
};

export type LocalAsset = {
  // Comes from API
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type?: any;
  assetType: LocalAssetType;
  value: string;
};

export const setupRaribleListings = async (listings: RaribleListing[]) => {
  const chainId = getChainId();
  const exchange = new Sdk.Rarible.Exchange(chainId);

  for (const listing of listings) {
    const { maker, nft, paymentToken } = listing;

    // Approve the exchange contract
    await nft.contract.connect(maker).mint(nft.id);
    await nft.contract
      .connect(maker)
      .setApprovalForAll(Sdk.Rarible.Addresses.NFTTransferProxy[chainId], true);

    // Build and sign the order
    const builder = new Sdk.Rarible.Builders.SingleToken(chainId);
    const order = builder.build({
      orderType: ORDER_TYPES.V2,
      maker: maker.address,
      side: "sell",
      tokenKind: listing.nft.kind,
      contract: nft.contract.address,
      price: listing.price.toString(),
      dataType: ORDER_DATA_TYPES.V3_SELL,
      tokenAmount: listing.nft.amount,
      tokenId: nft.id.toString(),
      paymentToken: paymentToken ?? Sdk.Common.Addresses.Native[chainId],
      startTime: await getCurrentTimestamp(ethers.provider),
      endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
      payouts: [
        {
          account: maker.address,
          value: "10000",
        },
      ],
    });

    await order.checkValidity();
    await order.sign(maker);
    await order.checkSignature();
    await order.checkFillability(ethers.provider);

    listing.order = order;

    // Cancel the order if requested
    if (listing.isCancelled) {
      await exchange.cancelOrder(maker, order);
    }
  }
};

// --- Offers ---

export const setupRaribleOffers = async (offers: RaribleListing[]) => {
  const chainId = getChainId();
  const exchange = new Sdk.Rarible.Exchange(chainId);

  for (const offer of offers) {
    const { maker, nft, price } = offer;

    const weth = new Sdk.Common.Helpers.WNative(ethers.provider, chainId);
    await weth.deposit(maker, price);
    await weth.approve(maker, Sdk.Rarible.Addresses.ERC20TransferProxy[chainId]);

    // Build and sign the order
    const builder = getRandomBoolean()
      ? new Sdk.Rarible.Builders.SingleToken(chainId)
      : new Sdk.Rarible.Builders.ContractWide(chainId);
    const order = builder.build({
      orderType: ORDER_TYPES.V2,
      maker: maker.address,
      side: offer.side,
      tokenKind: nft.kind,
      contract: nft.contract.address,
      price: price.toString(),
      dataType: ORDER_DATA_TYPES.V3_BUY,
      tokenId: nft.id.toString(),
      paymentToken: weth.contract.address,
      startTime: await getCurrentTimestamp(ethers.provider),
      endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
      payouts: [],
    });

    await order.checkValidity();
    await order.sign(maker);
    await order.checkSignature();
    await order.checkFillability(ethers.provider);

    offer.order = order;

    // Cancel the order if requested
    if (offer.isCancelled) {
      await exchange.cancelOrder(maker, order);
    }
  }
};
