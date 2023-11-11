import { BigNumberish } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import * as Sdk from "@reservoir0x/sdk/src";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { ethers } from "hardhat";
import { AddressZero } from "@ethersproject/constants";

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
  order?: Sdk.Hotpot.Order;
};

export const setupListings = async (
  listings: Listing[], 
  buyer: SignerWithAddress
) => {
  const chainId = getChainId();
  const exchange = new Sdk.Hotpot.Exchange(chainId);

  for (const listing of listings) {
    const { seller, nft, currency, price } = listing;

    // Approve the exchange contract
    await nft.contract.connect(seller).mint(nft.id);
    await nft.contract
      .connect(seller)
      .setApprovalForAll(Sdk.Hotpot.Addresses.Exchange[chainId], true);

    // Build and sign the order
    const builder = new Sdk.Hotpot.Builders.SingleTokenBuilder(chainId);
    const order = builder.build({
      currency: currency ?? Sdk.Common.Addresses.Native[chainId],
      collectionType:
        nft.kind === "erc721"
          ? Sdk.Hotpot.Types.OfferTokenType.ERC721
          : Sdk.Hotpot.Types.OfferTokenType.ERC1155,
      offerer: seller.address,
      tokenContract: nft.contract.address,
      offerTokenId: nft.id.toString(),
      price,
      amount: nft.amount ?? 1,
      royaltyPercent: 0,
      royaltyRecepient: AddressZero,
      endTime: (await getCurrentTimestamp(ethers.provider)) + 60*60*24,
    });
    await order.sign(seller);
    await order.buildMatching(
      ethers.provider, 
      buyer.address
    );

    listing.order = order;

    // Cancel the order if requested
    if (listing.isCancelled) {
      await exchange.cancelOrder(seller, order);
    }
  }
};
