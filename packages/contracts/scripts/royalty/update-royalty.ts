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
  const nftAddr = "0xc872f3b2c56a234ca90e44a55c8fd270dc0d2ea2";
  const nft = await ethers.getContractAt("ReservoirErc721", nftAddr);

  const tokenId = 1;
  const price = 10000;


  console.log(`==deployer ${deployer.address} updateRoyalty nft: ${nftAddr}`);

  let result;

  result = await nft.royaltyInfo(tokenId, price);
  console.log(`pre-check result: ${JSON.stringify(result, null, 3)}`);


  const bps = 500;
  const receipt = "0xF7Fc76dFF41a4F2C56a3E8a46F2718319655Bad4";
  result = await nft.updateRoyalty(receipt, bps);
  console.log(`updateRoyalty with result: ${JSON.stringify(result, null, 3)}`);

  await new Promise((resolve) => {
    setTimeout(resolve, 5 * 1000);
  });


  result = await nft.royaltyInfo(tokenId, price);
  console.log(`check result: ${JSON.stringify(result, null, 3)}`);
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
