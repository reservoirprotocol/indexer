/* eslint-disable no-console */

import * as Sdk from "@reservoir0x/sdk/src";
import { ethers } from "hardhat";

import { DEPLOYER, readDeployment, trigger } from "./trigger";

const main = async () => {
  const chainId = await ethers.provider.getNetwork().then((n) => n.chainId);

  // Make sure the current signer is the canonical deployer
  const [deployer] = await ethers.getSigners();
  if (deployer.address.toLowerCase() !== DEPLOYER.toLowerCase()) {
    throw new Error("Wrong deployer");
  }

  // 1. Deploy the router
  const router = await trigger.Router.V6_0_1().then(() =>
    readDeployment("ReservoirV6_0_1", "v3", chainId)
  );
  if (router) {
    Sdk.RouterV6.Addresses.Router[chainId] = router;
  }

  // 2. Deploy the approval proxy
  const approvalProxy = await trigger.Router.ApprovalProxy(chainId).then(() =>
    readDeployment("ReservoirApprovalProxy", "v1", chainId)
  );
  if (approvalProxy) {
    Sdk.RouterV6.Addresses.ApprovalProxy[chainId] = approvalProxy;
  }

  // 3. Deploy the conduit and grant access for the approval proxy
  await trigger.Router.SeaportConduit(chainId);

  // 4. Deploy the seaport off-chain cancellation zone
  await trigger.Utilities.OffChainCancellationZone(chainId, "v1.5");

  // 5. Deploy any modules that depend on the router
  for (const deploy of Object.values(trigger.Modules)) {
    await deploy(chainId);
  }

  // // 5. Deploy various utilities
  // for (const deploy of Object.values(trigger.Utilities)) {
  //   await deploy(chainId);
  // }

  // // 6. Deploy test NFTs
  // for (const deploy of Object.values(trigger.TestNFTs)) {
  //   await deploy();
  // }
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
