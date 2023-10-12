/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */

import { Deployer } from "@matterlabs/hardhat-zksync-deploy";
import * as Sdk from "@reservoir0x/sdk/src";
import hre, { ethers } from "hardhat";
import { Wallet } from "zksync-web3";

export const DEPLOYER = "0xf3d63166F0Ca56C3c1A3508FcE03Ff0Cf3Fb691e";

const main = async () => {
  const chainId = await ethers.provider.getNetwork().then((n) => n.chainId);

  const wallet = new Wallet(process.env.DEPLOYER_PK!);
  const deployer = new Deployer(hre, wallet);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deploy = async (contractName: string, args?: any[]) => {
    const c = await deployer
      .loadArtifact(contractName)
      .then((artifact) => deployer.deploy(artifact, args));
    console.log(`${contractName} deployed to address ${c.address.toLowerCase()}`);

    return c.address;
  };
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
