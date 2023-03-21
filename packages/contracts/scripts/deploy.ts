/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Addresses from "@reservoir0x/sdk/src/router/v6/addresses";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import hre, { ethers } from "hardhat";

export class DeploymentHelper {
  public deployer: SignerWithAddress;

  private constructor(deployer: SignerWithAddress) {
    this.deployer = deployer;
  }

  public static async getInstance(): Promise<DeploymentHelper> {
    const [deployer] = await ethers.getSigners();
    return new DeploymentHelper(deployer);
  }

  public async deploy(
    contractName: string,
    args: any[] = [],
    options?: {
      verifyOnEtherscan: boolean;
    }
  ) {
    const contract = await ethers
      .getContractFactory(contractName, this.deployer)
      .then((factory) => factory.deploy(...args));
    console.log(`"${contractName}" was deployed at address ${contract.address}`);

    if (options?.verifyOnEtherscan) {
      // Wait for the deployment tx to get propagated
      await new Promise((resolve) => setTimeout(resolve, 90 * 1000));
      await this.verify(contractName, contract.address, args);
    }

    return contract;
  }

  public async verify(contractName: string, contractAddress: string, args: any[]) {
    await hre.run("verify:verify", {
      address: contractAddress,
      constructorArguments: args,
    });
    console.log(`"${contractName}" successfully verified on Etherscan`);
  }
}

const main = async () => {
  const deploymentHelper = await DeploymentHelper.getInstance();
  const chainId = await deploymentHelper.deployer.getChainId();

  const args = [deploymentHelper.deployer.address];
  // await deploymentHelper.deploy("Permit2Module", args, {
  //   verifyOnEtherscan: true,
  // });
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
