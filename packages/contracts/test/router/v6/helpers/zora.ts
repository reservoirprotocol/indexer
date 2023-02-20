import { BigNumberish } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import * as Sdk from "@reservoir0x/sdk/src";

import { getChainId } from "../../../utils";

// --- Listings ---

export type ZoraListing = {
  seller: SignerWithAddress;
  nft: {
    contract: Contract;
    id: number;
  };
  // ETH if missing
  paymentToken?: string;
  price: BigNumberish;
  // Whether the order is to be cancelled
  isCancelled?: boolean;
  order?: Sdk.Zora.Order;
};

export const setupZoraListings = async (listings: ZoraListing[]) => {
  const chainId = getChainId();

  for (const listing of listings) {
    const { seller, nft, paymentToken, price } = listing;

    // Approve the "Asks" module
    const moduleManager = new Sdk.Zora.ModuleManager(chainId);
    await moduleManager.setApprovalForModule(
      seller,
      Sdk.Zora.Addresses.Exchange[chainId],
      true
    );

    // Approve the exchange contract
    await nft.contract.connect(seller).mint(nft.id);
    await nft.contract
      .connect(seller)
      .setApprovalForAll(
        Sdk.Zora.Addresses.Erc721TransferHelper[chainId],
        true
      );

    // Build and sign the order
    const exchange = new Sdk.Zora.Exchange(chainId);
    const order = new Sdk.Zora.Order(chainId, {
      tokenContract: nft.contract.address,
      tokenId: nft.id.toString(),
      askPrice: price.toString(),
      askCurrency: paymentToken ?? Sdk.Common.Addresses.Eth[chainId],
      sellerFundsRecipient: seller.address,
      findersFeeBps: 0,
    });
    await exchange.createOrder(seller, order);

    listing.order = order;

    // Cancel the order if requested
    if (listing.isCancelled) {
      await exchange.cancelOrder(seller, order);
    }
  }
};
