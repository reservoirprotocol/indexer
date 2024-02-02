import { BigNumberish } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import * as Sdk from "@reservoir0x/sdk/src";
import { parseEther } from "ethers/lib/utils";
import { ethers, network } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

import { getChainId, bn, getCurrentTimestamp } from "../../utils";

import FactoryAbi from "@reservoir0x/sdk/src/nftx-v3/abis/Factory.json";
import CreateVaultZapAbi from "@reservoir0x/sdk/src/nftx-v3/abis/CreateVaultZap.json";

// --- Listings ---

export type NFTXV3Listing = {
  seller: SignerWithAddress;
  nft: {
    contract: Contract;
    id: number;
  };
  price: BigNumberish;
  // Whether the order is to be cancelled
  isCancelled?: boolean;
  order?: Sdk.NftxV3.Order;
  vault?: string;
};

export const setupNFTXV3Listings = async (listings: NFTXV3Listing[]) => {
  const chainId = getChainId();

  const createVaultZap = new Contract(
    Sdk.NftxV3.Addresses.CreateVaultZap[chainId],
    CreateVaultZapAbi,
    ethers.provider
  );

  for (const listing of listings) {
    const { seller, nft, price, isCancelled } = listing;
    const pricePerToken = bn(price);

    const poolIds = [
      nft.id,
      ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19].map(
        (i) => nft.id + 10000 + i
      ),
    ];

    const txs = await Promise.all(poolIds.map((c) => nft.contract.connect(seller).mint(c)));
    await Promise.all(txs.map((c) => c.wait()));

    await nft.contract.connect(seller).setApprovalForAll(createVaultZap.address, true);

    // console.log({ pricePerToken: pricePerToken.toString() });

    const args = {
      vaultInfo: {
        assetAddress: nft.contract.address,
        is1155: false,
        allowAllItems: true,
        name: "TestNFT_" + new Date(), // adding timestamp so that multiple vaults can be deployed, without revert
        symbol: "TEST",
      },
      eligibilityStorage: {
        moduleIndex: 0,
        initData: "0x00",
      },
      nftIds: poolIds,
      nftAmounts: [],
      vaultFeaturesFlag: 111,
      vaultFees: {
        mintFee: parseEther("0.05"), // 5%
        redeemFee: parseEther("0.05"),
        swapFee: parseEther("0.05"),
      },
      liquidityParams: {
        lowerNFTPriceInETH: pricePerToken.sub(pricePerToken.mul(10).div(100)), // 10% lower
        upperNFTPriceInETH: pricePerToken.add(pricePerToken.mul(10).div(100)), // 10% higher
        fee: Sdk.NftxV3.Helpers.REWARD_FEE_TIER,
        currentNFTPriceInETH: pricePerToken,
        vTokenMin: 0,
        wethMin: 0,
        deadline: (await getCurrentTimestamp(ethers.provider)) + 60 * 60,
      },
    };

    // TODO: determine actual ETH value
    const value = bn(price).mul(100);

    const _vaultId = await createVaultZap.connect(seller).callStatic.createVault(args, { value });

    await createVaultZap.connect(seller).createVault(args, { value });

    const factory = new Contract(
      Sdk.NftxV3.Addresses.VaultFactory[chainId],
      FactoryAbi,
      ethers.provider
    );
    const vaultAddress = await factory.vault(_vaultId.toString());

    if (network && network.name === "tenderly") {
      await network.provider.send("evm_increaseTime", [
        ethers.utils.hexValue(2 * 60), // hex encoded number of seconds
      ]);
    } else {
      await time.increase(2 * 60);
    }

    const poolPrice = await Sdk.NftxV3.Helpers.getPoolPrice(
      vaultAddress,
      1,
      "buy",
      100,
      Sdk.NftxV3.Helpers.REWARD_FEE_TIER,
      ethers.provider,
      [nft.id]
    );

    if (poolPrice) {
      listing.price = bn(poolPrice.price);
      listing.vault = vaultAddress;
      listing.order = new Sdk.NftxV3.Order(chainId, vaultAddress, seller.address, {
        vaultId: _vaultId.toString(),
        collection: nft.contract.address,
        pool: vaultAddress,
        idsOut: [nft.id.toString()],
        price: isCancelled ? "0" : listing.price.toString(),
        executeCallData: isCancelled ? "0x00" : poolPrice.executeCallData,
        vTokenPremiumLimit: ethers.constants.MaxUint256.toString(),
        deductRoyalty: false,
      });
    }
  }
};

// --- Offers ---

export type NFTXV3Offer = {
  buyer: SignerWithAddress;
  nft: {
    contract: Contract;
    id: number;
  };
  price: BigNumberish;
  // Whether the order is to be cancelled
  isCancelled?: boolean;
  order?: Sdk.NftxV3.Order;
  vault?: string;
};

export const setupNFTXV3Offers = async (offers: NFTXV3Offer[]) => {
  const chainId = getChainId();

  const createVaultZap = new Contract(
    Sdk.NftxV3.Addresses.CreateVaultZap[chainId],
    CreateVaultZapAbi,
    ethers.provider
  );

  for (const offer of offers) {
    const { buyer, nft, price, isCancelled } = offer;
    const pricePerToken = bn(price);

    // console.log({
    //   pricePerToken: ethers.utils.formatEther(pricePerToken),
    // });

    // not providing nft.id here
    const poolIds = [
      ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map(
        (i) => nft.id + 10000 + i
      ),
    ];

    // Approve the factory contract
    const txs = await Promise.all(poolIds.map((c) => nft.contract.connect(buyer).mint(c)));
    await Promise.all(txs.map((c) => c.wait()));

    await nft.contract.connect(buyer).setApprovalForAll(createVaultZap.address, true);

    const args = {
      vaultInfo: {
        assetAddress: nft.contract.address,
        is1155: false,
        allowAllItems: true,
        name: "TestNFT_" + new Date(), // adding timestamp so that multiple vaults can be deployed, without revert
        symbol: "TEST",
      },
      eligibilityStorage: {
        moduleIndex: 0,
        initData: "0x00",
      },
      nftIds: poolIds,
      nftAmounts: [],
      vaultFeaturesFlag: 111,
      vaultFees: {
        mintFee: parseEther("0.05"), // 5%
        redeemFee: parseEther("0.05"),
        swapFee: parseEther("0.05"),
      },
      liquidityParams: {
        lowerNFTPriceInETH: pricePerToken.sub(pricePerToken.mul(10).div(100)), // 10% lower
        upperNFTPriceInETH: pricePerToken.add(pricePerToken.mul(10).div(100)), // 10% higher
        fee: Sdk.NftxV3.Helpers.REWARD_FEE_TIER,
        currentNFTPriceInETH: pricePerToken,
        vTokenMin: 0,
        wethMin: 0,
        deadline: (await getCurrentTimestamp(ethers.provider)) + 100,
      },
    };

    // TODO: determine actual ETH value
    const value = bn(price).mul(100);

    const _vaultId = await createVaultZap.connect(buyer).callStatic.createVault(args, { value });

    await createVaultZap.connect(buyer).createVault(args, { value });

    const factory = new Contract(
      Sdk.NftxV3.Addresses.VaultFactory[chainId],
      FactoryAbi,
      ethers.provider
    );
    const vaultAddress = await factory.vault(_vaultId.toString());

    if (network && network.name === "tenderly") {
      await network.provider.send("evm_increaseTime", [
        ethers.utils.hexValue(2 * 60), // hex encoded number of seconds
      ]);
    } else {
      await time.increase(2 * 60);
    }

    const poolPrice = await Sdk.NftxV3.Helpers.getPoolPrice(
      vaultAddress,
      1,
      "sell",
      100,
      Sdk.NftxV3.Helpers.REWARD_FEE_TIER,
      ethers.provider
    );

    if (poolPrice) {
      offer.price = bn(poolPrice.price);
      offer.vault = vaultAddress;
      offer.order = new Sdk.NftxV3.Order(chainId, vaultAddress, buyer.address, {
        vaultId: _vaultId.toString(),
        collection: nft.contract.address,
        pool: vaultAddress,
        currency: Sdk.Common.Addresses.WNative[chainId],
        idsIn: [nft.id.toString()],
        amounts: [],
        price: isCancelled ? "0" : offer.price.toString(),
        executeCallData: isCancelled ? "0x00" : poolPrice.executeCallData,
        deductRoyalty: false,
      });
    }
  }
};
