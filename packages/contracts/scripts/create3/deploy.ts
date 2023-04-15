/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { AddressZero, HashZero } from "@ethersproject/constants";
import * as Sdk from "@reservoir0x/sdk/src";
import { promises as fs } from "fs";

import { DeploymentHelper } from "./deployment-helper";

const DEPLOYER = "0xf3d63166F0Ca56C3c1A3508FcE03Ff0Cf3Fb691e";
const DEPLOYMENTS_FILE = "deployments.json";

const readDeployment = async (
  contractName: string,
  version: string,
  chainId: number
): Promise<string | undefined> => {
  const deployments = JSON.parse(await fs.readFile(DEPLOYMENTS_FILE, { encoding: "utf8" }));
  return deployments[contractName]?.[version]?.[chainId];
};

const writeDeployment = async (
  address: string,
  contractName: string,
  version: string,
  chainId: number
) => {
  const deployments = JSON.parse(await fs.readFile(DEPLOYMENTS_FILE, { encoding: "utf8" }));
  if (!deployments[contractName]) {
    deployments[contractName] = {};
  }
  if (!deployments[contractName][version]) {
    deployments[contractName][version] = {};
  }

  deployments[contractName][version][chainId] = address.toLowerCase();

  await fs.writeFile(DEPLOYMENTS_FILE, JSON.stringify(deployments, null, 2));

  console.log(
    `Version ${version} of contract ${contractName} deployed on chain ${chainId} at address ${address}`
  );
};

const deploy = async (contractName: string, version: string, args: any[]) => {
  const dh = await DeploymentHelper.getInstance();

  if (args.some((arg) => !arg || arg === AddressZero || arg === HashZero)) {
    throw new Error("Invalid args");
  }

  if (await readDeployment(contractName, version, dh.chainId)) {
    throw new Error(
      `Version ${version} of ${contractName} already deployed on chain ${dh.chainId}`
    );
  }

  const address = await dh.deploy(contractName, version, args);
  await writeDeployment(address, contractName, version, dh.chainId);
};

const verify = async (contractName: string, version: string, args: any[]) => {
  const dh = await DeploymentHelper.getInstance();

  const address = await readDeployment(contractName, version, dh.chainId);
  if (!address) {
    throw new Error("No deployment found");
  }

  await dh.verify(address, args);
};

const dv = async (contractName: string, version: string, args: any[]) => {
  await deploy(contractName, version, args);
  await new Promise((resolve) => setTimeout(resolve, 30000));
  await verify(contractName, version, args);
};

export const triggerByModule = {
  ReservoirV6_0_1: async () => dv("ReservoirV6_0_1", "v3", []),
  ReservoirApprovalProxy: async (chainId: number) =>
    dv("ReservoirApprovalProxy", "v1", [
      Sdk.SeaportBase.Addresses.ConduitController[chainId],
      Sdk.RouterV6.Addresses.Router[chainId],
    ]),
  ElementModule: async (chainId: number) =>
    dv("ElementModule", "v1", [
      DEPLOYER,
      Sdk.RouterV6.Addresses.Router[chainId],
      Sdk.Element.Addresses.Exchange[chainId],
    ]),
  FoundationModule: async (chainId: number) =>
    dv("FoundationModule", "v1", [
      DEPLOYER,
      Sdk.RouterV6.Addresses.Router[chainId],
      Sdk.Foundation.Addresses.Exchange[chainId],
    ]),
  LooksRareModule: async (chainId: number) =>
    dv("LooksRareModule", "v1", [
      DEPLOYER,
      Sdk.RouterV6.Addresses.Router[chainId],
      Sdk.LooksRare.Addresses.Exchange[chainId],
    ]),
  LooksRareV2Module: async (chainId: number) =>
    dv("LooksRareV2Module", "v1", [
      DEPLOYER,
      Sdk.RouterV6.Addresses.Router[chainId],
      Sdk.LooksRareV2.Addresses.Exchange[chainId],
    ]),
  NFTXModule: async (chainId: number) =>
    dv("NFTXModule", "v1", [
      DEPLOYER,
      Sdk.RouterV6.Addresses.Router[chainId],
      Sdk.Nftx.Addresses.MarketplaceZap[chainId],
    ]),
  RaribleModule: async (chainId: number) =>
    dv("RaribleModule", "v1", [
      DEPLOYER,
      Sdk.RouterV6.Addresses.Router[chainId],
      Sdk.Rarible.Addresses.Exchange[chainId],
      Sdk.Rarible.Addresses.NFTTransferProxy[chainId],
    ]),
  SeaportModule: async (chainId: number) =>
    dv("SeaportModule", "v1", [
      DEPLOYER,
      Sdk.RouterV6.Addresses.Router[chainId],
      Sdk.SeaportV11.Addresses.Exchange[chainId],
    ]),
  SeaportV14Module: async (chainId: number) =>
    dv("SeaportV14Module", "v2", [
      DEPLOYER,
      Sdk.RouterV6.Addresses.Router[chainId],
      Sdk.SeaportV14.Addresses.Exchange[chainId],
    ]),
  AlienswapModule: async (chainId: number) =>
    dv("AlienswapModule", "v1", [
      DEPLOYER,
      Sdk.RouterV6.Addresses.Router[chainId],
      Sdk.Alienswap.Addresses.Exchange[chainId],
    ]),
  SudoswapModule: async (chainId: number) =>
    dv("SudoswapModule", "v1", [
      DEPLOYER,
      Sdk.RouterV6.Addresses.Router[chainId],
      Sdk.Sudoswap.Addresses.Router[chainId],
    ]),
  SuperRareModule: async (chainId: number) =>
    dv("SuperRareModule", "v1", [
      DEPLOYER,
      Sdk.RouterV6.Addresses.Router[chainId],
      Sdk.SuperRare.Addresses.Bazaar[chainId],
    ]),
  SwapModule: async (chainId: number) =>
    dv("SwapModule", "v1", [
      DEPLOYER,
      Sdk.RouterV6.Addresses.Router[chainId],
      Sdk.Common.Addresses.Weth[chainId],
      Sdk.Common.Addresses.SwapRouter[chainId],
    ]),
  X2Y2Module: async (chainId: number) =>
    dv("X2Y2Module", "v1", [
      DEPLOYER,
      Sdk.RouterV6.Addresses.Router[chainId],
      Sdk.X2Y2.Addresses.Exchange[chainId],
      Sdk.X2Y2.Addresses.Erc721Delegate[chainId],
      Sdk.X2Y2.Addresses.Erc1155Delegate[chainId],
    ]),
  ZeroExV4Module: async (chainId: number) =>
    dv("ZeroExV4Module", "v1", [
      DEPLOYER,
      Sdk.RouterV6.Addresses.Router[chainId],
      Sdk.ZeroExV4.Addresses.Exchange[chainId],
    ]),
  ZoraModule: async (chainId: number) =>
    dv("ZoraModule", "v1", [
      DEPLOYER,
      Sdk.RouterV6.Addresses.Router[chainId],
      Sdk.Zora.Addresses.Exchange[chainId],
    ]),
};
