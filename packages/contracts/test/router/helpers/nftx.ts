import { BigNumberish } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import * as Sdk from "@reservoir0x/sdk/src";
import { ethers } from "hardhat";

import { getChainId, bn } from "../../utils";

import FactoryAbi from "@reservoir0x/sdk/src/nftx/abis/Factory.json";
import NFTXStakingZapAbi from "@reservoir0x/sdk/src/nftx/abis/NFTXStakingZap.json";

// --- Listings ---

export type NFTXListing = {
  seller: SignerWithAddress;
  nft: {
    contract: Contract;
    id: number;
  };
  price: BigNumberish;
  // Whether the order is to be cancelled
  isCancelled?: boolean;
  order?: Sdk.Nftx.Order;
  vault?: string;
  lpToken?: string;
};

export const setupNFTXListings = async (listings: NFTXListing[]) => {
  const chainId = getChainId();

  const factory = new Contract(
    Sdk.Nftx.Addresses.VaultFactory[chainId],
    FactoryAbi,
    ethers.provider
  );
  for (const listing of listings) {
    const { seller, nft, price, isCancelled } = listing;

    const newId = nft.id;
    const newId2 = nft.id + 10002;
    const newId3 = nft.id + 10003;
    const newId4 = nft.id + 10004;

    const poolIds = [newId, newId2, newId3, newId4];

    // Approve the factory contract
    const txs = await Promise.all(poolIds.map((c) => nft.contract.connect(seller).mint(c)));
    await Promise.all(txs.map((c) => c.wait()));

    const _vaultId = await factory
      .connect(seller)
      .callStatic.createVault("TestNFT", "TEST", nft.contract.address, false, true);

    await factory.connect(seller).createVault("TestNFT", "TEST", nft.contract.address, false, true);

    await nft.contract
      .connect(seller)
      .setApprovalForAll(Sdk.Nftx.Addresses.NFTXStakingZap[chainId], true);

    const NFTXStakingZap = new Contract(
      Sdk.Nftx.Addresses.NFTXStakingZap[chainId],
      NFTXStakingZapAbi,
      ethers.provider
    );

    await NFTXStakingZap.connect(seller).addLiquidity721ETH(_vaultId, poolIds, price, {
      value: price,
    });

    const vaultAddress = await factory.vault(_vaultId.toString());

    const SUSHI_ROUTER = Sdk.Nftx.Addresses.SushiRouter[chainId];
    const sushiRouter = new Contract(
      SUSHI_ROUTER,
      new ethers.utils.Interface(["function factory() external view returns (address)"]),
      ethers.provider
    );

    const factoryAddr = await sushiRouter.factory();
    const sushiFactory = new Contract(
      factoryAddr,
      new ethers.utils.Interface([
        "function getPair(address, address) external view returns (address)",
      ]),
      ethers.provider
    );

    const lpToken = await sushiFactory.getPair(vaultAddress, Sdk.Common.Addresses.WNative[chainId]);

    const [poolPrice] = await Promise.all([
      Sdk.Nftx.Helpers.getPoolPrice(vaultAddress, 1, "buy", 100, ethers.provider),
      Sdk.Nftx.Helpers.getPoolNFTs(vaultAddress, ethers.provider),
    ]);

    if (poolPrice.price) {
      listing.price = bn(poolPrice.price);
      listing.vault = vaultAddress;
      listing.lpToken = lpToken;
      listing.order = new Sdk.Nftx.Order(chainId, {
        vaultId: _vaultId.toString(),
        collection: nft.contract.address,
        pool: vaultAddress,
        specificIds: [newId.toString()],
        amount: "1",
        path: [Sdk.Common.Addresses.WNative[chainId], vaultAddress],
        price: isCancelled ? "0" : listing.price.toString(),
        extra: {
          prices: [listing.price.toString()],
        },
      });
    }
  }
};

// --- Offers ---

export type NFTXOffer = {
  buyer: SignerWithAddress;
  nft: {
    contract: Contract;
    id: number;
  };
  price: BigNumberish;
  // Whether the order is to be cancelled
  isCancelled?: boolean;
  order?: Sdk.Nftx.Order;
  vault?: string;
  lpToken?: string;
};

export const setupNFTXOffers = async (offers: NFTXOffer[]) => {
  const chainId = getChainId();

  const factory = new Contract(
    Sdk.Nftx.Addresses.VaultFactory[chainId],
    FactoryAbi,
    ethers.provider
  );

  for (const offer of offers) {
    const { buyer, nft, price, isCancelled } = offer;

    const newId = nft.id;
    const newId2 = nft.id + 10002;
    const newId3 = nft.id + 10003;
    const newId4 = nft.id + 10004;

    const poolIds = [newId2, newId3, newId4];

    // Approve the factory contract
    const txs = await Promise.all(poolIds.map((c) => nft.contract.connect(buyer).mint(c)));
    await Promise.all(txs.map((c) => c.wait()));

    const _vaultId = await factory
      .connect(buyer)
      .callStatic.createVault("TestNFT", "TEST", nft.contract.address, false, true);

    await factory.connect(buyer).createVault("TestNFT", "TEST", nft.contract.address, false, true);

    await nft.contract
      .connect(buyer)
      .setApprovalForAll(Sdk.Nftx.Addresses.NFTXStakingZap[chainId], true);

    const NFTXStakingZap = new Contract(
      Sdk.Nftx.Addresses.NFTXStakingZap[chainId],
      NFTXStakingZapAbi,
      ethers.provider
    );

    await NFTXStakingZap.connect(buyer).addLiquidity721ETH(_vaultId, poolIds, price, {
      value: price,
    });

    const vaultAddress = await factory.vault(_vaultId.toString());

    const SUSHI_ROUTER = Sdk.Nftx.Addresses.SushiRouter[chainId];
    const sushiRouter = new Contract(
      SUSHI_ROUTER,
      new ethers.utils.Interface(["function factory() external view returns (address)"]),
      ethers.provider
    );

    const factoryAddr = await sushiRouter.factory();
    const sushiFactory = new Contract(
      factoryAddr,
      new ethers.utils.Interface([
        "function getPair(address, address) external view returns (address)",
      ]),
      ethers.provider
    );

    const lpToken = await sushiFactory.getPair(vaultAddress, Sdk.Common.Addresses.WNative[chainId]);

    const [poolPrice] = await Promise.all([
      Sdk.Nftx.Helpers.getPoolPrice(vaultAddress, 1, "sell", 100, ethers.provider),
      Sdk.Nftx.Helpers.getPoolNFTs(vaultAddress, ethers.provider),
    ]);

    if (poolPrice.price) {
      offer.price = bn(poolPrice.price);
      offer.vault = vaultAddress;
      offer.lpToken = lpToken;
      offer.order = new Sdk.Nftx.Order(chainId, {
        vaultId: _vaultId.toString(),
        pool: vaultAddress,
        collection: nft.contract.address,
        currency: Sdk.Common.Addresses.WNative[chainId],
        specificIds: [newId.toString()],
        price: isCancelled ? offer.price.mul(bn(10)).toString() : offer.price.toString(),
        extra: {
          prices: [offer.price.toString()],
        },
        path: [vaultAddress, Sdk.Common.Addresses.WNative[chainId]],
      });
    }
  }
};
