/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { Interface } from "@ethersproject/abi";
import { AddressZero, HashZero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import * as Sdk from "@reservoir0x/sdk/src";
import { promises as fs } from "fs";
import { ethers } from "hardhat";

import { DeploymentHelper } from "./deployment-helper";

export const DEPLOYER = "0xf3d63166F0Ca56C3c1A3508FcE03Ff0Cf3Fb691e";
const DEPLOYMENTS_FILE = "deployments.json";

export const readDeployment = async (
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
    `Version ${version} of contract ${contractName} deployed on chain ${chainId} at address ${address.toLowerCase()}`
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

  return address;
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
  try {
    await deploy(contractName, version, args);
    await new Promise((resolve) => setTimeout(resolve, 30000));
    await verify(contractName, version, args);
  } catch (error) {
    console.log(`Failed to deploy/verify ${contractName}: ${error}`);
  }
};

export const trigger = {
  // Router
  Router: {
    V6_0_1: async () => dv("ReservoirV6_0_1", "v3", []),
    ApprovalProxy: async (chainId: number) =>
      dv("ReservoirApprovalProxy", "v1", [
        Sdk.SeaportBase.Addresses.ConduitController[chainId],
        Sdk.RouterV6.Addresses.Router[chainId],
      ]),
    PermitProxy: async (chainId: number) =>
      dv("PermitProxy", "v2", [
        Sdk.RouterV6.Addresses.Router[chainId],
        Sdk.Common.Addresses.GelatoRelay1BalanceERC2771[chainId],
      ]),
    SeaportConduit: async (chainId: number) => {
      const contractName = "SeaportConduit";
      const version = "v1";

      try {
        const [deployer] = await ethers.getSigners();

        const conduitController = new Contract(
          Sdk.SeaportBase.Addresses.ConduitController[chainId],
          new Interface([
            "function getConduit(bytes32 conduitKey) view returns (address conduit, bool exists)",
            "function updateChannel(address conduit, address channel, bool isOpen)",
            "function createConduit(bytes32 conduitKey, address initialOwner)",
            "function getChannelStatus(address conduit, address channel) view returns (bool)",
          ]),
          deployer
        );

        const conduitKey = `${DEPLOYER}000000000000000000000000`;

        const result = await conduitController.getConduit(conduitKey);
        if (!result.exists) {
          await conduitController.createConduit(conduitKey, DEPLOYER);
          await new Promise((resolve) => setTimeout(resolve, 30000));
        }

        // Grant ApprovalProxy
        if (
          Sdk.RouterV6.Addresses.ApprovalProxy[chainId] &&
          !(await conduitController.getChannelStatus(
            result.conduit,
            Sdk.RouterV6.Addresses.ApprovalProxy[chainId]
          ))
        ) {
          await conduitController.updateChannel(
            result.conduit,
            Sdk.RouterV6.Addresses.ApprovalProxy[chainId],
            true
          );
        }

        // Grant Seaport
        if (
          Sdk.SeaportV15.Addresses.Exchange[chainId] &&
          !(await conduitController.getChannelStatus(
            result.conduit,
            Sdk.SeaportV15.Addresses.Exchange[chainId]
          ))
        ) {
          await conduitController.updateChannel(
            result.conduit,
            Sdk.SeaportV15.Addresses.Exchange[chainId],
            true
          );
        }

        if (!(await readDeployment(contractName, version, chainId))) {
          await writeDeployment(result.conduit, contractName, version, chainId);
        }
      } catch (error) {
        console.log(`Failed to deploy ${contractName}: ${error}`);
      }
    },
  },
  // Modules
  Modules: {
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
      dv("NFTXModule", "v2", [
        DEPLOYER,
        Sdk.RouterV6.Addresses.Router[chainId],
        Sdk.Nftx.Addresses.MarketplaceZap[chainId],
      ]),
    NFTXZeroExModule: async (chainId: number) =>
      dv("NFTXZeroExModule", "v2", [
        DEPLOYER,
        Sdk.RouterV6.Addresses.Router[chainId],
        Sdk.Nftx.Addresses.ZeroExMarketplaceZap[chainId],
      ]),
    RaribleModule: async (chainId: number) =>
      dv("RaribleModule", "v3", [
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
    SeaportV15Module: async (chainId: number) =>
      dv("SeaportV15Module", "v2", [
        DEPLOYER,
        Sdk.RouterV6.Addresses.Router[chainId],
        Sdk.SeaportV15.Addresses.Exchange[chainId],
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
    SudoswapV2Module: async (chainId: number) =>
      [1, 5].includes(chainId)
        ? dv("SudoswapV2Module", "v2", [DEPLOYER, Sdk.RouterV6.Addresses.Router[chainId]])
        : undefined,
    MidaswapModule: async (chainId: number) =>
      [1, 5].includes(chainId)
        ? dv("MidaswapModule", "v2", [
            DEPLOYER,
            Sdk.RouterV6.Addresses.Router[chainId],
            Sdk.Midaswap.Addresses.PairFactory[chainId],
            Sdk.Midaswap.Addresses.Router[chainId],
            Sdk.Common.Addresses.WNative[chainId],
          ])
        : undefined,
    CaviarV1Module: async (chainId: number) =>
      [1, 5].includes(chainId)
        ? dv("CaviarV1Module", "v1", [DEPLOYER, Sdk.RouterV6.Addresses.Router[chainId]])
        : undefined,
    SuperRareModule: async (chainId: number) =>
      dv("SuperRareModule", "v1", [
        DEPLOYER,
        Sdk.RouterV6.Addresses.Router[chainId],
        Sdk.SuperRare.Addresses.Bazaar[chainId],
      ]),
    SwapModule: async (chainId: number) =>
      dv("SwapModule", "v3", [
        DEPLOYER,
        Sdk.RouterV6.Addresses.Router[chainId],
        Sdk.Common.Addresses.WNative[chainId],
        Sdk.Common.Addresses.SwapRouter[chainId],
      ]),
    OneInchSwapModule: async (chainId: number) =>
      dv("OneInchSwapModule", "v2", [
        DEPLOYER,
        Sdk.RouterV6.Addresses.Router[chainId],
        Sdk.Common.Addresses.WNative[chainId],
        Sdk.Common.Addresses.AggregationRouterV5[chainId],
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
    CollectionXyzModule: async (chainId: number) =>
      dv("CollectionXyzModule", "v2", [
        DEPLOYER,
        Sdk.RouterV6.Addresses.Router[chainId],
        Sdk.CollectionXyz.Addresses.CollectionRouter[chainId],
      ]),
    CryptoPunksModule: async (chainId: number) =>
      dv("CryptoPunksModule", "v1", [
        DEPLOYER,
        Sdk.RouterV6.Addresses.Router[chainId],
        Sdk.CryptoPunks.Addresses.Exchange[chainId],
      ]),
    PaymentProcessorModule: async (chainId: number) =>
      dv("PaymentProcessorModule", "v5", [
        DEPLOYER,
        Sdk.RouterV6.Addresses.Router[chainId],
        Sdk.PaymentProcessor.Addresses.Exchange[chainId],
      ]),
    MintModule: async () => dv("MintModule", "v3", []),
  },
  // Utilities
  Utilities: {
    OffChainCancellationZone: async (chainId: number) => {
      if (!(await readDeployment("SignedZoneController", "v1", chainId))) {
        await dv("SignedZoneController", "v1", []);
      }

      const [deployer] = await ethers.getSigners();

      const controller = new Contract(
        await readDeployment("SignedZoneController", "v1", chainId).then((a) => a!),
        new Interface([
          "function createZone(string zoneName, string apiEndpoint, string documentationURI, address initialOwner, bytes32 salt)",
          "function getZone(bytes32 salt) view returns (address)",
          "function getActiveSigners(address zone) view returns (address[])",
          "function updateSigner(address zone, address signer, bool active)",
        ]),
        deployer
      );

      const salt = deployer.address.padEnd(66, "0");
      const zoneAddress = await controller.getZone(salt).then((a: string) => a.toLowerCase());
      const code = await ethers.provider.getCode(zoneAddress);
      if (code === "0x") {
        const tx = await controller.createZone(
          "CancellationOracle",
          "",
          "",
          deployer.address,
          salt
        );
        await tx.wait();

        console.log(`Deployed cancellation zone at address ${zoneAddress}`);
      }

      const oracleSigner = "0x32da57e736e05f75aa4fae2e9be60fd904492726";
      const activeSigners = await controller
        .getActiveSigners(zoneAddress)
        .then((signers: string[]) => signers.map((s) => s.toLowerCase()));
      if (!activeSigners.includes(oracleSigner)) {
        await controller.updateSigner(zoneAddress, oracleSigner, true);
        console.log(`Signer ${oracleSigner} configured`);
      }
    },
  },
};
