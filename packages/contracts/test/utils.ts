/* eslint-disable @typescript-eslint/no-explicit-any */

import { Interface } from "@ethersproject/abi";
import { Provider } from "@ethersproject/abstract-provider";
import { BigNumberish, BigNumber } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import * as Sdk from "@reservoir0x/sdk/src";
import { Network, getRandomBytes } from "@reservoir0x/sdk/src/utils";
import { ethers, network } from "hardhat";
import fs from "fs";

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

export const getRandomFloat = (min: number, max: number) => Math.random() * (max - min) + min;

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
export const getChainId = () => {
  const chainId = (network.config as any)?.chainId;
  const forking = (network.config as any)?.forking;
  if (chainId) {
    return chainId;
  } else if (forking?.url.includes("goerli")) {
    return Network.EthereumGoerli;
  } else if (forking?.url.includes("sepolia")) {
    return Network.EthereumSepolia;
  } else {
    return Network.Ethereum;
  }
};

// --- Deployments ---

// Deploy mock ERC20 contract
export const setupTokens = async (deployer: SignerWithAddress) => {
  const erc20: any = await ethers
    .getContractFactory("MockERC20", deployer)
    .then((factory) => factory.deploy());

  return { erc20 };
};

// Deploy mock ERC721/1155 contracts
export const setupNFTs = async (
  deployer: SignerWithAddress,
  whitelistedOperators: string[] = []
) => {
  const erc721: any = await ethers
    .getContractFactory("MockERC721", deployer)
    .then((factory) => factory.deploy());

  const erc1155: any = await ethers
    .getContractFactory("MockERC1155", deployer)
    .then((factory) => factory.deploy());

  const erc721c: any = await ethers
    .getContractFactory("MockERC721C", deployer)
    .then((factory) => factory.deploy());

  const erc721cWithWhitelist: any = await ethers
    .getContractFactory("MockERC721C", deployer)
    .then((factory) => factory.deploy());

  if (whitelistedOperators.length) {
    await erc721cWithWhitelist.connect(deployer).setToDefaultSecurityPolicy();

    const validatorAddress = await erc721cWithWhitelist.getTransferValidator();
    const validator = new Contract(
      validatorAddress,
      new Interface([
        "function createOperatorWhitelist(string calldata name) external returns (uint120)",
        "function addOperatorToWhitelist(uint120 id, address operator) external",
      ]),
      ethers.provider
    );

    const operatorWhitelistId = await validator
      .connect(deployer)
      .callStatic.createOperatorWhitelist("whitelist");
    await validator.connect(deployer).createOperatorWhitelist("whitelist");

    for (const operator of whitelistedOperators) {
      await validator.connect(deployer).addOperatorToWhitelist(operatorWhitelistId, operator);
    }

    await erc721cWithWhitelist
      .connect(deployer)
      .setToCustomSecurityPolicy(2, operatorWhitelistId, 0);
  }

  return { erc721, erc1155, erc721c, erc721cWithWhitelist };
};

export const setupERC721CV2 = async (
  deployer: SignerWithAddress,
  securityLevel?: number,
  whitelist?: {
    accounts: string[];
    codeHashes: string[];
  },
  blacklist?: {
    accounts: string[];
    codeHashes: string[];
  }
) => {
  if (!process.env.ERC721C_V2_FILE && process.env.ERC721C_V2_VALIDATOR_FILE) {
    process.exit(1);
  }

  const forgeOutFile = JSON.parse(fs.readFileSync(String(process.env.ERC721C_V2_FILE), "utf-8"));
  const validatorFile = JSON.parse(
    fs.readFileSync(String(process.env.ERC721C_V2_VALIDATOR_FILE), "utf-8")
  );

  const txIds: {
    type: string;
    tx: string;
  }[] = [];

  const erc721c = await ethers
    .getContractFactory(forgeOutFile.abi, forgeOutFile.bytecode.object, deployer)
    .then((factory) => factory.deploy());

  const validator = await ethers
    .getContractFactory(validatorFile.abi, validatorFile.bytecode.object, deployer)
    .then((factory) => factory.deploy(deployer.address));

  {
    const tx = await erc721c.connect(deployer).setTransferValidator(validator.address);
    txIds.push({
      type: "setTransferValidator",
      tx: tx.hash,
    });
  }
  const DEFAULT_TRANSFER_SECURITY_LEVEL = await erc721c.DEFAULT_TRANSFER_SECURITY_LEVEL();
  const DEFAULT_LIST_ID = await erc721c.DEFAULT_LIST_ID();

  const applySecurityLevel = securityLevel ?? DEFAULT_TRANSFER_SECURITY_LEVEL;
  {
    const tx = await validator
      .connect(deployer)
      .setTransferSecurityLevelOfCollection(erc721c.address, applySecurityLevel);
    txIds.push({
      type: "setTransferSecurityLevelOfCollection",
      tx: tx.hash,
    });
  }

  {
    const tx = await validator
      .connect(deployer)
      .applyListToCollection(erc721c.address, DEFAULT_LIST_ID);
    txIds.push({
      type: "applyListToCollection",
      tx: tx.hash,
    });
  }

  if (whitelist || blacklist) {
    const listId = await validator.connect(deployer).callStatic.createList("Test List");

    await validator.connect(deployer).createList("Test List");

    if (blacklist?.accounts.length) {
      {
        const tx = await validator.addAccountsToBlacklist(listId, blacklist?.accounts);
        txIds.push({
          type: "addAccountsToBlacklist",
          tx: tx.hash,
        });

        // Generate remove tx
        const removeTx = await validator.removeAccountsFromBlacklist(listId, blacklist?.accounts);
        txIds.push({
          type: "removeAccountsFromBlacklist",
          tx: removeTx.hash,
        });

        const addTx = await validator.addAccountsToBlacklist(listId, blacklist?.accounts);
        txIds.push({
          type: "addAccountsToBlacklist",
          tx: addTx.hash,
        });
      }
    }

    if (blacklist?.codeHashes.length) {
      {
        const tx = await validator.addCodeHashesToBlacklist(listId, blacklist?.codeHashes);
        txIds.push({
          type: "addCodeHashesToBlacklist",
          tx: tx.hash,
        });

        // Generate remove tx
        const removeTx = await validator.removeCodeHashesFromBlacklist(
          listId,
          blacklist?.codeHashes
        );
        txIds.push({
          type: "removeCodeHashesFromBlacklist",
          tx: removeTx.hash,
        });

        const addTx = await validator.addCodeHashesToBlacklist(listId, blacklist?.codeHashes);
        txIds.push({
          type: "addCodeHashesToBlacklist",
          tx: addTx.hash,
        });
      }
    }

    if (whitelist?.accounts.length) {
      {
        const tx = await validator.addAccountsToWhitelist(listId, whitelist?.accounts);
        txIds.push({
          type: "addAccountsToWhitelist",
          tx: tx.hash,
        });

        // Generate remove tx
        const removeTx = await validator.removeAccountsFromWhitelist(listId, whitelist?.accounts);
        txIds.push({
          type: "removeAccountsFromWhitelist",
          tx: removeTx.hash,
        });

        const addTx = await validator.addAccountsToWhitelist(listId, whitelist?.accounts);
        txIds.push({
          type: "addAccountsToWhitelist",
          tx: addTx.hash,
        });
      }
    }

    if (whitelist?.codeHashes.length) {
      {
        const tx = await validator.addCodeHashesToWhitelist(listId, whitelist?.codeHashes);
        txIds.push({
          type: "addCodeHashesToWhitelist",
          tx: tx.hash,
        });

        // Generate remove tx
        const removeTx = await validator.removeCodeHashesFromWhitelist(
          listId,
          whitelist?.codeHashes
        );
        txIds.push({
          type: "removeCodeHashesFromWhitelist",
          tx: removeTx.hash,
        });

        const addTx = await validator.addCodeHashesToWhitelist(listId, whitelist?.codeHashes);
        txIds.push({
          type: "addCodeHashesToWhitelist",
          tx: addTx.hash,
        });
      }
    }

    {
      const tx = await validator.connect(deployer).applyListToCollection(erc721c.address, listId);
      txIds.push({
        type: "applyListToCollection",
        tx: tx.hash,
      });
    }
  }

  return { erc721c, validator, txIds };
};

export const setupConduit = async (
  chainId: number,
  deployer: SignerWithAddress,
  channels: string[]
) => {
  const iface = new Interface([
    "function createConduit(bytes32 conduitKey, address initialOwner) returns (address)",
    "function updateChannel(address conduit, address channel, bool isOpen) external",
  ]);

  const conduitKey = `${deployer.address}000000000000000000000000`;

  try {
    await deployer.sendTransaction({
      to: Sdk.SeaportBase.Addresses.ConduitController[chainId],
      data: iface.encodeFunctionData("createConduit", [conduitKey, deployer.address]),
    });
  } catch {
    // Skip any errors (conduit already created)
  }

  for (const channel of channels) {
    await deployer.sendTransaction({
      to: Sdk.SeaportBase.Addresses.ConduitController[chainId],
      data: iface.encodeFunctionData("updateChannel", [
        new Sdk.SeaportBase.ConduitController(chainId).deriveConduit(conduitKey),
        channel,
        true,
      ]),
    });
  }

  return conduitKey;
};

export const setupZones = async (chainId: number, deployer: SignerWithAddress) => {
  const signedZoneController: any = await ethers
    .getContractFactory("SignedZoneController", deployer)
    .then((factory) => factory.deploy());

  const zoneName = "test";
  const apiEndpoint = "test";
  const documentationURI = "test";
  const salt = `${deployer.address}` + getRandomBytes(12).toHexString().replace("0x", "");
  const initialOwner = deployer.address;

  const zoneAddress = await signedZoneController.callStatic.createZone(
    zoneName,
    apiEndpoint,
    documentationURI,
    initialOwner,
    salt
  );

  await signedZoneController.createZone(
    zoneName,
    apiEndpoint,
    documentationURI,
    initialOwner,
    salt
  );
  await signedZoneController.updateSigner(zoneAddress, deployer.address, true);

  Sdk.SeaportBase.Addresses.ReservoirCancellationZone[chainId] = zoneAddress;

  return {
    zone: zoneAddress.toLowerCase(),
    signedZoneController,
    signer: deployer,
  };
};

export const setupV16Zones = async (chainId: number, deployer: SignerWithAddress) => {
  const signedZoneController: any = await ethers
    .getContractFactory("SignedZoneControllerV16", deployer)
    .then((factory) => factory.deploy());

  const zoneName = "test";
  const apiEndpoint = "test";
  const documentationURI = "test";
  const salt = `${deployer.address}` + getRandomBytes(12).toHexString().replace("0x", "");
  const initialOwner = deployer.address;

  const zoneAddress = await signedZoneController.callStatic.createZone(
    zoneName,
    apiEndpoint,
    documentationURI,
    initialOwner,
    salt
  );

  await signedZoneController.createZone(
    zoneName,
    apiEndpoint,
    documentationURI,
    initialOwner,
    salt
  );

  await signedZoneController.updateSigner(zoneAddress, deployer.address, true);

  Sdk.SeaportBase.Addresses.ReservoirV16CancellationZone[chainId] = zoneAddress;

  return {
    zone: zoneAddress.toLowerCase(),
    signedZoneController,
    signer: deployer,
  };
};

// Deploy router with modules and override any SDK addresses
export const setupRouterWithModules = async (chainId: number, deployer: SignerWithAddress) => {
  // Deploy router

  const router = await ethers
    .getContractFactory("ReservoirV6_0_1", deployer)
    .then((factory) => factory.deploy());
  Sdk.RouterV6.Addresses.Router[chainId] = router.address.toLowerCase();

  // Deploy modules

  const seaportModule = await ethers
    .getContractFactory("SeaportModule", deployer)
    .then((factory) =>
      factory.deploy(deployer.address, router.address, Sdk.SeaportV11.Addresses.Exchange[chainId])
    );
  Sdk.RouterV6.Addresses.SeaportModule[chainId] = seaportModule.address.toLowerCase();

  const seaportV14Module = await ethers
    .getContractFactory("SeaportV14Module", deployer)
    .then((factory) =>
      factory.deploy(deployer.address, router.address, Sdk.SeaportV14.Addresses.Exchange[chainId])
    );
  Sdk.RouterV6.Addresses.SeaportV14Module[chainId] = seaportV14Module.address.toLowerCase();

  const seaportV15Module = await ethers
    .getContractFactory("SeaportV15Module", deployer)
    .then((factory) =>
      factory.deploy(deployer.address, router.address, Sdk.SeaportV15.Addresses.Exchange[chainId])
    );
  Sdk.RouterV6.Addresses.SeaportV15Module[chainId] = seaportV15Module.address.toLowerCase();

  const seaportV16Module = await ethers
    .getContractFactory("SeaportV16Module", deployer)
    .then((factory) =>
      factory.deploy(deployer.address, router.address, Sdk.SeaportV16.Addresses.Exchange[chainId])
    );
  Sdk.RouterV6.Addresses.SeaportV16Module[chainId] = seaportV16Module.address.toLowerCase();

  const zeroExV4Module = await ethers
    .getContractFactory("ZeroExV4Module", deployer)
    .then((factory) =>
      factory.deploy(deployer.address, router.address, Sdk.ZeroExV4.Addresses.Exchange[chainId])
    );
  Sdk.RouterV6.Addresses.ZeroExV4Module[chainId] = zeroExV4Module.address.toLowerCase();

  const swapModule = (await ethers
    .getContractFactory("SwapModule", deployer)
    .then((factory) =>
      factory.deploy(
        deployer.address,
        deployer.address,
        Sdk.Common.Addresses.WNative[chainId],
        Sdk.Common.Addresses.SwapRouter[chainId]
      )
    )) as any;
  Sdk.RouterV6.Addresses.SwapModule[chainId] = swapModule.address.toLowerCase();

  const approvalProxy = await ethers
    .getContractFactory("ReservoirApprovalProxy", deployer)
    .then((factory) =>
      factory.deploy(Sdk.SeaportBase.Addresses.ConduitController[chainId], router.address)
    );
  Sdk.RouterV6.Addresses.ApprovalProxy[chainId] = approvalProxy.address.toLowerCase();

  const permitProxy = await ethers
    .getContractFactory("PermitProxy", deployer)
    .then((factory) => factory.deploy(router.address, deployer.address));
  Sdk.RouterV6.Addresses.PermitProxy[chainId] = permitProxy.address.toLowerCase();

  const paymentProcessorModule = await ethers
    .getContractFactory("PaymentProcessorModule", deployer)
    .then((factory) =>
      factory.deploy(
        deployer.address,
        router.address,
        Sdk.PaymentProcessor.Addresses.Exchange[chainId]
      )
    );
  Sdk.RouterV6.Addresses.PaymentProcessorModule[chainId] =
    paymentProcessorModule.address.toLowerCase();

  const conduitKey = await setupConduit(chainId, deployer, [approvalProxy.address]);
  Sdk.SeaportBase.Addresses.ReservoirConduitKey[chainId] = conduitKey;
};
