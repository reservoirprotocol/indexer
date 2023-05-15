/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */

import { Interface } from "@ethersproject/abi";
import { Signer } from "@ethersproject/abstract-signer";
import { Contract } from "@ethersproject/contracts";
import { keccak256 } from "@ethersproject/solidity";
import hre, { ethers } from "hardhat";

export class DeploymentHelper {
  public deployer: Signer;
  public chainId: number;

  public create3FactoryAddress: string;

  private constructor(
    deployer: Signer,
    chainId: number,
    overrides?: {
      create3FactoryAddress?: string;
    }
  ) {
    this.deployer = deployer;
    this.chainId = chainId;

    // Default: https://github.com/lifinance/create3-factory
    this.create3FactoryAddress =
      overrides?.create3FactoryAddress ?? "0x93FEC2C00BfE902F733B57c5a6CeeD7CD1384AE1";
  }

  public static async getInstance(create3FactoryAddress?: string): Promise<DeploymentHelper> {
    const [deployer] = await ethers.getSigners();

    const chainId = await deployer.getChainId();
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

    await create3Factory.deploy(salt, creationCode);

    const deploymentAddress: string = await create3Factory.getDeployed(
      await this.deployer.getAddress(),
      salt
    );
    return deploymentAddress;
  }

  public async verify(contractAddress: string, args: any[]) {
    if (process.env.ETHERSCAN_API_KEY) {
      await hre.run("verify:verify", {
        address: contractAddress,
        constructorArguments: args,
      });
    }
  }
}
