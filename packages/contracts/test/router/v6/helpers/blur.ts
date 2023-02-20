import { BigNumberish } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import * as Sdk from "@reservoir0x/sdk/src";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { ethers } from "hardhat";

import { getChainId, getCurrentTimestamp } from "../../../utils";

// --- Listings ---

export type BlurListing = {
  seller: SignerWithAddress;
  nft: {
    // TODO: Add support for ERC1155 once Blur integrates it
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
  order?: Sdk.Blur.Order;
};

export const setupBlurListings = async (listings: BlurListing[]) => {
  const chainId = getChainId();
  const exchange = new Sdk.Blur.Exchange(chainId);

  for (const listing of listings) {
    const { seller, nft, currency, price } = listing;

    // Approve the exchange contract
    if (nft.kind === "erc721") {
      await nft.contract.connect(seller).mint(nft.id);
      await nft.contract
        .connect(seller)
        .setApprovalForAll(Sdk.Blur.Addresses.ExecutionDelegate[chainId], true);
    } else {
      await nft.contract.connect(seller).mint(nft.id);
      await nft.contract
        .connect(seller)
        .setApprovalForAll(Sdk.Blur.Addresses.ExecutionDelegate[chainId], true);
    }

    // Build and sign the order
    const builder = new Sdk.Blur.Builders.SingleToken(chainId);
    const order = builder.build({
      side: "sell",
      trader: seller.address,
      collection: nft.contract.address,
      tokenId: nft.id,
      amount: 1,
      paymentToken: currency ?? Sdk.Common.Addresses.Eth[chainId],
      price,
      listingTime: await getCurrentTimestamp(ethers.provider),
      matchingPolicy: Sdk.Blur.Addresses.StandardPolicyERC721[chainId],
      nonce: 0,
      expirationTime: (await getCurrentTimestamp(ethers.provider)) + 60,
      salt: 0,
      extraParams: "0x",
      fees: [],
    });
    await order.sign(seller);

    listing.order = order;

    // Cancel the order if requested
    if (listing.isCancelled) {
      await exchange.cancelOrder(seller, order);
    }
  }
};
