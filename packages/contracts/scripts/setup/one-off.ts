/* eslint-disable no-console */

import { ethers } from "hardhat";

import { DEPLOYER, readDeployment, trigger } from "./trigger";

const main = async () => {
  const chainId = await ethers.provider.getNetwork().then((n) => n.chainId);
  //
  // // Make sure the current signer is the canonical deployer
  // const [deployer] = await ethers.getSigners();
  // if (deployer.address.toLowerCase() !== DEPLOYER.toLowerCase()) {
  //   throw new Error("Wrong deployer");
  // }
  //
  // chainId;
  // trigger;
    // 部署 AlienswapModule
    const router = await trigger.Router.ApprovalProxy(chainId)
    console.log("xxxxxx", router)
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
