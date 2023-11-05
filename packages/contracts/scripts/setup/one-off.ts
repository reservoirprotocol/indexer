/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */

import { DEPLOYER, trigger } from "./trigger";
import hre from "hardhat";
import '@nomiclabs/hardhat-ethers';

const main = async () => {
  const chainId = await hre.ethers.provider.getNetwork().then((n) => n.chainId);

  // Make sure the current signer is the canonical deployer
  const [deployer] = await hre.ethers.getSigners();
  if (deployer.address.toLowerCase() !== DEPLOYER.toLowerCase()) {
    console.log(deployer.address.toLowerCase(), DEPLOYER.toLowerCase());
    throw new Error("Wrong deployer");
  }

  await trigger.Modules.HotpotModule(chainId);
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
