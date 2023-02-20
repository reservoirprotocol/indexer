import { BigNumberish } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import * as Sdk from "@reservoir0x/sdk/src";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { ethers } from "hardhat";
import * as Element from "@reservoir0x/sdk/src/element";

import { getChainId, getCurrentTimestamp } from "../../../utils";

// --- Listings ---

export type ElementListing = {
  seller: SignerWithAddress;
  nft: {
    kind: "erc721" | "erc1155";
    contract: Contract;
    id: number;
    // A single quantity if missing
    amount?: number;
  };
  isBatchSignedOrder?: boolean;
  // ETH if missing
  paymentToken?: string;
  price: BigNumberish;
  // Whether the order is to be cancelled
  isCancelled?: boolean;
  order?: Sdk.Element.Order;
};

export const setupElementListings = async (listings: ElementListing[]) => {
  const chainId = getChainId();

  for (const listing of listings) {
    const { seller, nft, paymentToken, price } = listing;

    // Approve the exchange contract
    if (nft.kind === "erc721") {
      await nft.contract.connect(seller).mint(nft.id);
      await nft.contract
        .connect(seller)
        .setApprovalForAll(Sdk.Element.Addresses.Exchange[chainId], true);
    } else {
      await nft.contract.connect(seller).mint(nft.id);
      await nft.contract
        .connect(seller)
        .setApprovalForAll(Sdk.Element.Addresses.Exchange[chainId], true);
    }

    // Build and sign the order
    let order;
    if (listing.isBatchSignedOrder && nft.kind === "erc721") {
      const builder = new Sdk.Element.Builders.BatchSignedToken(chainId);
      order = builder.build({
        maker: seller.address,
        contract: nft.contract.address,
        tokenId: nft.id,
        paymentToken: paymentToken ?? Sdk.Element.Addresses.Eth[chainId],
        price,
        hashNonce: 0,
        listingTime: await getCurrentTimestamp(ethers.provider),
        expirationTime: (await getCurrentTimestamp(ethers.provider)) + 100,
        startNonce: Date.now(),
      });
    } else {
      const builder = new Sdk.Element.Builders.SingleToken(chainId);
      order = builder.build({
        direction: "sell",
        maker: seller.address,
        contract: nft.contract.address,
        tokenId: nft.id,
        paymentToken: paymentToken ?? Element.Addresses.Eth[chainId],
        price,
        hashNonce: 0,
        expiry: (await getCurrentTimestamp(ethers.provider)) + 60,
        amount: nft.kind === "erc721" ? undefined : "1",
        nonce: Date.now(),
      });
    }
    
    await order.sign(seller);

    listing.order = order;

    // Cancel the order if requested
    if (listing.isCancelled) {
      const exchange = new Sdk.Element.Exchange(chainId);
      await exchange.cancelOrder(seller, order);
    }
  }
};

export type ElementOffer = {
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
  order?: Sdk.Element.Order;
};

export const setupElementOffers = async (offers: ElementOffer[]) => {
  const chainId = getChainId();
  
  for (const offer of offers) {
    const { buyer, nft, price } = offer;
    
    const weth = new Sdk.Common.Helpers.Weth(ethers.provider, chainId);
    await weth.deposit(buyer, price);
    await weth.approve(buyer, Sdk.Element.Addresses.Exchange[chainId]);
    
    // Build and sign the order
    const builder = new Sdk.Element.Builders.SingleToken(chainId);
    const order = builder.build({
      direction: "buy",
      maker: buyer.address,
      contract: nft.contract.address,
      tokenId: nft.id,
      paymentToken: Sdk.Common.Addresses.Weth[chainId],
      price,
      hashNonce: 0,
      expiry: (await getCurrentTimestamp(ethers.provider)) + 60,
      amount: nft.kind === "erc721" ? undefined : "1",
      nonce: Date.now(),
    });
    await order.sign(buyer);
    
    offer.order = order;
    
    // Cancel the order if requested
    if (offer.isCancelled) {
      const exchange = new Sdk.Element.Exchange(chainId);
      const tx = await exchange.cancelOrder(buyer, order);
      await tx.wait();
    }
  }
};
