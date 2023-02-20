import { BigNumberish } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import * as Sdk from "@reservoir0x/sdk/src";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { ethers } from "hardhat";

import { getChainId, getCurrentTimestamp } from "../../../utils";

// --- Listings ---

export type LooksRareListing = {
  seller: SignerWithAddress;
  nft: {
    kind: "erc721" | "erc1155";
    contract: Contract;
    id: number;
    // A single quantity if missing
    amount?: number;
  };
  // ETH if missing
  currency?: string;
  price: BigNumberish;
  // Whether the order is to be cancelled
  isCancelled?: boolean;
  order?: Sdk.LooksRare.Order;
};

export const setupLooksRareListings = async (listings: LooksRareListing[]) => {
  const chainId = getChainId();
  const exchange = new Sdk.LooksRare.Exchange(chainId);

  for (const listing of listings) {
    const { seller, nft, currency, price } = listing;

    // Approve the exchange contract
    if (nft.kind === "erc721") {
      await nft.contract.connect(seller).mint(nft.id);
      await nft.contract
        .connect(seller)
        .setApprovalForAll(
          Sdk.LooksRare.Addresses.TransferManagerErc721[chainId],
          true
        );
    } else {
      await nft.contract.connect(seller).mint(nft.id);
      await nft.contract
        .connect(seller)
        .setApprovalForAll(
          Sdk.LooksRare.Addresses.TransferManagerErc1155[chainId],
          true
        );
    }

    // Build and sign the order
    const builder = new Sdk.LooksRare.Builders.SingleToken(chainId);
    const order = builder.build({
      isOrderAsk: true,
      signer: seller.address,
      collection: nft.contract.address,
      tokenId: nft.id,
      currency: currency ?? Sdk.Common.Addresses.Weth[chainId],
      price,
      startTime: await getCurrentTimestamp(ethers.provider),
      endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
    });
    await order.sign(seller);

    listing.order = order;

    // Cancel the order if requested
    if (listing.isCancelled) {
      await exchange.cancelOrder(seller, order);
    }
  }
};

// --- Offers ---

export type LooksRareOffer = {
  buyer: SignerWithAddress;
  nft: {
    kind: "erc721" | "erc1155";
    contract: Contract;
    id: number;
  };
  // For the moment, all orders are in WETH
  price: BigNumberish;
  // Whether the order is to be cancelled
  isCancelled?: boolean;
  order?: Sdk.LooksRare.Order;
};

export const setupLooksRareOffers = async (offers: LooksRareOffer[]) => {
  const chainId = getChainId();
  const exchange = new Sdk.LooksRare.Exchange(chainId);

  for (const offer of offers) {
    const { buyer, nft, price } = offer;

    const weth = new Sdk.Common.Helpers.Weth(ethers.provider, chainId);
    await weth.deposit(buyer, price);
    await weth.approve(buyer, Sdk.LooksRare.Addresses.Exchange[chainId]);

    // Build and sign the order
    const builder = new Sdk.LooksRare.Builders.SingleToken(chainId);
    const order = builder.build({
      isOrderAsk: false,
      signer: buyer.address,
      collection: nft.contract.address,
      tokenId: nft.id,
      currency: Sdk.Common.Addresses.Weth[chainId],
      price,
      startTime: await getCurrentTimestamp(ethers.provider),
      endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
    });
    await order.sign(buyer);

    offer.order = order;

    // Cancel the order if requested
    if (offer.isCancelled) {
      await exchange.cancelOrder(buyer, order);
    }
  }
};
