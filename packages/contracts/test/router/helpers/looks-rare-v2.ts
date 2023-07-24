import { BigNumberish } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import * as Sdk from "@reservoir0x/sdk/src";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { ethers } from "hardhat";

import { getChainId, getCurrentTimestamp } from "../../utils";

// --- Listings ---

export type Listing = {
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
  order?: Sdk.LooksRareV2.Order;
};

export const setupListings = async (listings: Listing[]) => {
  const chainId = getChainId();
  const exchange = new Sdk.LooksRareV2.Exchange(chainId);

  for (const listing of listings) {
    const { seller, nft, currency, price } = listing;

    try {
      await exchange.grantApprovals(seller, [Sdk.LooksRareV2.Addresses.Exchange[chainId]]);
    } catch {
      // Skip errors (coming from duplicate granting of approvals)
    }

    // Approve the exchange contract
    if (nft.kind === "erc721") {
      await nft.contract.connect(seller).mint(nft.id);
      await nft.contract
        .connect(seller)
        .setApprovalForAll(Sdk.LooksRareV2.Addresses.TransferManager[chainId], true);
    } else {
      await nft.contract.connect(seller).mint(nft.id);
      await nft.contract
        .connect(seller)
        .setApprovalForAll(Sdk.LooksRareV2.Addresses.TransferManager[chainId], true);
    }

    // Build and sign the order
    const builder = new Sdk.LooksRareV2.Builders.SingleToken(chainId);
    const order = builder.build({
      quoteType: Sdk.LooksRareV2.Types.QuoteType.Ask,
      collectionType:
        nft.kind === "erc721"
          ? Sdk.LooksRareV2.Types.CollectionType.ERC721
          : Sdk.LooksRareV2.Types.CollectionType.ERC1155,
      signer: seller.address,
      collection: nft.contract.address,
      itemId: nft.id,
      currency: currency ?? Sdk.Common.Addresses.Native[chainId],
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

export type Offer = {
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
  order?: Sdk.LooksRareV2.Order;
};

export const setupOffers = async (offers: Offer[]) => {
  const chainId = getChainId();
  const exchange = new Sdk.LooksRareV2.Exchange(chainId);

  for (const offer of offers) {
    const { buyer, nft, price } = offer;

    const weth = new Sdk.Common.Helpers.WNative(ethers.provider, chainId);
    await weth.deposit(buyer, price);
    await weth.approve(buyer, Sdk.LooksRareV2.Addresses.Exchange[chainId]);

    // Build and sign the order
    const builder = new Sdk.LooksRareV2.Builders.ContractWide(chainId);
    const order = builder.build({
      quoteType: Sdk.LooksRareV2.Types.QuoteType.Bid,
      collectionType:
        nft.kind === "erc721"
          ? Sdk.LooksRareV2.Types.CollectionType.ERC721
          : Sdk.LooksRareV2.Types.CollectionType.ERC1155,
      signer: buyer.address,
      collection: nft.contract.address,
      currency: Sdk.Common.Addresses.WNative[chainId],
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
