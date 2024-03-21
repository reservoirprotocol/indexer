/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */

import { Interface } from "@ethersproject/abi";
import { Signer } from "@ethersproject/abstract-signer";
import { Contract } from "@ethersproject/contracts";
import { keccak256 } from "@ethersproject/solidity";
import * as Sdk from "@reservoir0x/sdk/src";
import { Network } from "@reservoir0x/sdk/src/utils";
import hre, { ethers } from "hardhat";

export const getGasConfigs = (chainId: number) => {
  if ([Network.Zora, Network.Ancient8Testnet, Network.Ancient8].includes(chainId)) {
    return {
      maxFeePerGas: "2000000000",
      maxPriorityFeePerGas: "500000000",
    };
  }

  return {};
};

export class DeploymentHelper {
  public deployer: Signer;
  public chainId: number;

  public create3FactoryAddress: string;

  private constructor(
    deployer: Signer,
    chainId: number,
    overrides: {
      create3FactoryAddress: string;
    }
  ) {
    this.deployer = deployer;
    this.chainId = chainId;
    this.create3FactoryAddress = overrides.create3FactoryAddress;
  }

  public static async getInstance(): Promise<DeploymentHelper> {
    const [deployer] = await ethers.getSigners();
    const chainId = await deployer.getChainId();

    // Default: https://github.com/lifinance/create3-factory
    let create3FactoryAddress = "0x93FEC2C00BfE902F733B57c5a6CeeD7CD1384AE1";
    const code = await ethers.provider.getCode(create3FactoryAddress);
    if (!code || code === "0x") {
      create3FactoryAddress = Sdk.Common.Addresses.Create3Factory[chainId];
    }
    if (!create3FactoryAddress) {
      throw new Error("No CREATE3 factory available");
    }

    return new DeploymentHelper(deployer, chainId, { create3FactoryAddress });
  }

  public async deploy(contractName: string, version: string, args: any[] = []) {
    const create3Factory = new Contract(
      this.create3FactoryAddress,
      new Interface([
        `
          function deploy(
            bytes32 salt,
            bytes memory creationCode
          ) returns (address)
        `,
        `
          function getDeployed(
            address deployer,
            bytes32 salt
          ) view returns (address)
        `,
      ]),
      this.deployer
    );

    const salt = keccak256(["string", "string"], [contractName, version]);
    const creationCode = await ethers
      .getContractFactory(contractName, this.deployer)
      .then((factory) => factory.getDeployTransaction(...args).data);

    await create3Factory.deploy(salt, creationCode, getGasConfigs(this.chainId));

    const deploymentAddress: string = await create3Factory.getDeployed(
      await this.deployer.getAddress(),
      salt
    );
    return deploymentAddress;
  }

  public async verify(contractAddress: string, args: any[], contractName?: string) {
    await hre.run("verify:verify", {
      address: contractAddress,
      constructorArguments: args,
      contract:
        // These contracts have the same bytecode so we have to differentiate
        contractName && ["SeaportV15Module", "SeaportV16Module"].includes(contractName)
          ? `contracts/router/modules/exchanges/${contractName}.sol:${contractName}`
          : undefined,
    });
  }
}
