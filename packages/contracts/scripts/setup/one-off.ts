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

  const router = await trigger.Router.V6_0_1();
  // 输出日志
  // Version v3 of contract ReservoirV6_0_1 deployed on chain 195 at address 0x9f7292ba383db44928933f52ef2acc03816594f2
  console.log(`router output: ${router}`);

  // // 部署 AlienswapModule
  // const address = await trigger.Modules.AlienswapModule(chainId);
  // // 输出日志
  // // Version v1 of contract AlienswapModule deployed on chain 195 at address 0xd378d97ee22374cbada072076f7ca3a7ab107019

  // // 部署 ApprovalProxy
  // const router = await trigger.Router.ApprovalProxy(chainId)
  // // 输出日志
  // // Version v1 of contract ReservoirApprovalProxy deployed on chain 195 at address 0x6072b1def04135d572ee645437ac0be6f3e0b980
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
