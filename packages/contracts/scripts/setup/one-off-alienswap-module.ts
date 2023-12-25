/* eslint-disable no-console */

import { ethers } from "hardhat";

import { DEPLOYER, trigger } from "./trigger";

const main = async () => {
  const chainId = await ethers.provider.getNetwork().then((n) => n.chainId);

  // Make sure the current signer is the canonical deployer
  const [deployer] = await ethers.getSigners();
  if (deployer.address.toLowerCase() !== DEPLOYER.toLowerCase()) {
    throw new Error("Wrong deployer");
  }

  // const router = await trigger.Router.V6_0_1();
  // Version v3 of contract ReservoirV6_0_1 deployed on chain 43851 at address 0x0041b69cfbcf70cb4faa81c00abb0a3c5d93e008

  // 部署 AlienswapModule
  const alienModuleAddress = await trigger.Modules.AlienswapModule(chainId);
  console.log(`output AlienswapModule: ${alienModuleAddress}`);
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
