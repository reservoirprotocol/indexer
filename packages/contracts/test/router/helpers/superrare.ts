import { BigNumberish } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import * as Sdk from "@reservoir0x/sdk/src";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";

import { getChainId } from "../../utils";

// --- Listings ---

export type SuperRareListing = {
  seller: SignerWithAddress;
  nft: {
    contract: Contract;
    id: number;
  };
  // For the moment, all orders are in ETH
  price: BigNumberish;
  // Whether the order is to be cancelled
  isCancelled?: boolean;
  order?: Sdk.Foundation.Order;
};

export const setupSuperRareListings = async (listings: SuperRareListing[]) => {
  const chainId = getChainId();

  for (const listing of listings) {
    const { seller, nft, price } = listing;

    // Approve the exchange contract
    await nft.contract.connect(seller).mint(nft.id);
    await nft.contract
      .connect(seller)
      .setApprovalForAll(Sdk.SuperRare.Addresses.Bazaar[chainId], true);

    // Build and sign the order
    const exchange = new Sdk.SuperRare.Exchange(chainId);
    const order = new Sdk.SuperRare.Order(chainId, {
      maker: seller.address,
      contract: nft.contract.address,
      tokenId: nft.id.toString(),
      price: price.toString(),
      currency: Sdk.Common.Addresses.Native[chainId],
      splitAddresses: [seller.address],
      splitRatios: [100],
    });
    await exchange.createOrder(seller, order);

    listing.order = order;

    // Cancel the order if requested
    if (listing.isCancelled) {
      await exchange.cancelOrder(seller, order);
    }
  }
};
