import { Provider } from "@ethersproject/abstract-provider";
import { BigNumberish, BigNumber } from "@ethersproject/bignumber";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import * as Sdk from "@reservoir0x/sdk/src";
import { ethers, network } from "hardhat";

// --- Misc ---

export const bn = (value: BigNumberish) => BigNumber.from(value);

export const lc = (value: string) => value.toLowerCase();

export const getCurrentTimestamp = async (provider: Provider) =>
  provider.getBlock("latest").then((b) => b.timestamp);

export const getRandomBoolean = () => Math.random() < 0.5;

export const getRandomInteger = (min: number, max: number) => {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

export const getRandomFloat = (min: number, max: number) =>
  Math.random() * (max - min) + min;

// --- Network ---

// Reset forked network state
export const reset = async () => {
  if ((network.config as any).forking) {
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: (network.config as any).forking.url,
            blockNumber: (network.config as any).forking.blockNumber,
          },
        },
      ],
    });
  }
};

// Retrieve the forked network's chain id
export const getChainId = () =>
  (network.config as any).forking?.url.includes("goerli") ? 5 : 1;

// --- Deployments ---

// Deploy mock ERC20 contract
export const setupTokens = async (deployer: SignerWithAddress) => {
  const erc20: any = await ethers
    .getContractFactory("MockERC20", deployer)
    .then((factory) => factory.deploy());

  return { erc20 };
};

// Deploy mock ERC721/1155 contracts
export const setupNFTs = async (deployer: SignerWithAddress) => {
  const erc721: any = await ethers
    .getContractFactory("MockERC721", deployer)
    .then((factory) => factory.deploy());
  const erc1155: any = await ethers
    .getContractFactory("MockERC1155", deployer)
    .then((factory) => factory.deploy());

  return { erc721, erc1155 };
};

// Deploy router with modules and override any SDK addresses
export const setupRouterWithModules = async (
  chainId: number,
  deployer: SignerWithAddress
) => {
  // Deploy router

  const router = await ethers
    .getContractFactory("ReservoirV6_0_0", deployer)
    .then((factory) => factory.deploy());
  Sdk.RouterV6.Addresses.Router[chainId] = router.address.toLowerCase();

  // Deploy modules

  const looksRareModule = await ethers
    .getContractFactory("LooksRareModule", deployer)
    .then((factory) => factory.deploy(deployer.address, router.address));
  Sdk.RouterV6.Addresses.LooksRareModule[chainId] =
    looksRareModule.address.toLowerCase();

  const seaportModule = await ethers
    .getContractFactory("SeaportModule", deployer)
    .then((factory) => factory.deploy(deployer.address, router.address));
  Sdk.RouterV6.Addresses.SeaportModule[chainId] =
    seaportModule.address.toLowerCase();

  const seaportV12Module = await ethers
    .getContractFactory("SeaportV12Module", deployer)
    .then((factory) => factory.deploy(deployer.address, router.address));
  Sdk.RouterV6.Addresses.SeaportV12Module[chainId] =
    seaportV12Module.address.toLowerCase();

  const zeroExV4Module = await ethers
    .getContractFactory("ZeroExV4Module", deployer)
    .then((factory) => factory.deploy(deployer.address, router.address));
  Sdk.RouterV6.Addresses.ZeroExV4Module[chainId] =
    zeroExV4Module.address.toLowerCase();

  const uniswapV3Module = await ethers
    .getContractFactory("UniswapV3Module", deployer)
    .then((factory) => factory.deploy(deployer.address, router.address));
  Sdk.RouterV6.Addresses.UniswapV3Module[chainId] =
    uniswapV3Module.address.toLowerCase();

  const wethModule = await ethers
    .getContractFactory("WETHModule", deployer)
    .then((factory) => factory.deploy(deployer.address));
  Sdk.RouterV6.Addresses.WETHModule[chainId] = wethModule.address.toLowerCase();

  const permit2Module = (await ethers
    .getContractFactory("Permit2Module", deployer)
    .then((factory) => factory.deploy(deployer.address))) as any;
  Sdk.RouterV6.Addresses.Permit2Module[chainId] =
    permit2Module.address.toLowerCase();
};
