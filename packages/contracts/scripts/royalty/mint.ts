/* eslint-disable no-console */

import { ethers } from "hardhat";
import { DEPLOYER } from "../setup/trigger";

const main = async () => {
  // Make sure the current signer is the canonical deployer
  const [deployer] = await ethers.getSigners();
  if (deployer.address.toLowerCase() !== DEPLOYER.toLowerCase()) {
    throw new Error("Wrong deployer");
  }

  // x1-testnet test-nft
  const contractAddr = "0xf1b4f863c5982b6e6def8a80e07649c4f643f37a";
  const nft = await ethers.getContractAt("ReservoirErc721", contractAddr);
  console.log(`==deployer ${deployer.address}`);

  // 每次mint，这里+1
  const tokenId = 2;
  const result = await nft.mint(tokenId);
  console.log(`mint result: ${JSON.stringify(result, null, 3)}`);
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
