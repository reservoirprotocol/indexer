import { BigNumberish } from "@ethersproject/bignumber";
import { AddressZero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import * as Sdk from "@reservoir0x/sdk/src";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { ethers } from "hardhat";

import { bn, getChainId } from "../../utils";

import FactoryAbi from "@reservoir0x/sdk/src/sudoswap-v2/abis/Factory.json";

// --- Listings ---

export type SudoswapListing = {
  seller: SignerWithAddress;
  nft: {
    contract: Contract;
    id: number;
  };
  price: BigNumberish;
  // Whether the order is to be cancelled
  isCancelled?: boolean;
  order?: Sdk.SudoswapV2.Order;
};

export const setupSudoswapListings = async (listings: SudoswapListing[]) => {
  const chainId = getChainId();

  const factory = new Contract(
    Sdk.SudoswapV2.Addresses.PairFactory[chainId],
    FactoryAbi,
    ethers.provider
  );
  for (const listing of listings) {
    const { seller, nft, price, isCancelled } = listing;

    // Approve the factory contract
    await nft.contract.connect(seller).mint(nft.id);
    await nft.contract
      .connect(seller)
      .setApprovalForAll(Sdk.SudoswapV2.Addresses.PairFactory[chainId], true);

    // Get the pair address by making a static call to the deploy method
    const pair = await factory.connect(seller).callStatic.createPairERC721ETH(
      nft.contract.address,
      Sdk.SudoswapV2.Addresses.LinearCurve[chainId],
      seller.address,
      1, // NFT
      0,
      0,
      price,
      AddressZero,
      isCancelled ? [] : [nft.id]
    );

    // Actually deploy the pair
    await factory.connect(seller).createPairERC721ETH(
      nft.contract.address,
      Sdk.SudoswapV2.Addresses.LinearCurve[chainId],
      seller.address,
      1, // NFT
      0,
      0,
      price,
      AddressZero,
      isCancelled ? [] : [nft.id]
    );

    listing.order = new Sdk.SudoswapV2.Order(chainId, {
      pair,
      extra: {
        prices: [price.toString()],
      },
    });
  }
};

// --- Offers ---

export type SudoswapOffer = {
  buyer: SignerWithAddress;
  nft: {
    contract: Contract;
    id: number;
  };
  price: BigNumberish;
  // Whether the order is to be cancelled
  isCancelled?: boolean;
  order?: Sdk.SudoswapV2.Order;
};

export const setupSudoswapOffers = async (offers: SudoswapOffer[]) => {
  const chainId = getChainId();

  const factory = new Contract(
    Sdk.SudoswapV2.Addresses.PairFactory[chainId],
    FactoryAbi,
    ethers.provider
  );
  for (const offer of offers) {
    const { buyer, nft, price, isCancelled } = offer;

    // Get the pair address by making a static call to the deploy method
    const pair = await factory.connect(buyer).callStatic.createPairERC721ETH(
      nft.contract.address,
      Sdk.SudoswapV2.Addresses.LinearCurve[chainId],
      buyer.address,
      0, // TOKEN
      0,
      0,
      price,
      AddressZero,
      [],
      { value: isCancelled ? bn(0) : price }
    );

    // Actually deploy the pair
    await factory.connect(buyer).createPairERC721ETH(
      nft.contract.address,
      Sdk.SudoswapV2.Addresses.LinearCurve[chainId],
      buyer.address,
      0, // TOKEN
      0,
      0,
      price,
      AddressZero,
      [],
      { value: isCancelled ? bn(0) : price }
    );

    offer.order = new Sdk.SudoswapV2.Order(chainId, {
      pair,
      extra: {
        prices: [price.toString()],
      },
    });
  }
};
