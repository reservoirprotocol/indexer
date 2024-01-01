/* eslint-disable no-console */

import { ethers } from "hardhat";
import { DEPLOYER, trigger } from "./trigger";

const main = async () => {
  // Make sure the current signer is the canonical deployer
  const [deployer] = await ethers.getSigners();
  if (deployer.address.toLowerCase() !== DEPLOYER.toLowerCase()) {
    throw new Error("Wrong deployer");
  }

  await trigger.Utilities.LiteRoyaltyEngine();
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
