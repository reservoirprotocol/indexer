
import hre, { ethers } from "hardhat";

const asMarket = "0x9ea919393024b92f7e8856864580ad61c8af9821";
const asConduit = "0x24Ae55A1F64DBCfD687E2BcCAdD5499c87A5C5d9";
const main = async () => {

  // FairFight
  // https://alienswap.xyz/assets/zkfair/0x828fa47d6b078f00a7728ab6bba2a10832e14491/6717
  // const contractAddr = "0x828fa47d6b078f00a7728ab6bba2a10832e14491";
  // const contract = await ethers.getContractAt("ReservoirErc721", contractAddr);
  // const tokenId = 6717;
  // const prevOwner = "0x0FE0E72d41A7E6C97EA977Ea1a749BEb4044b01D";

  // zkfair punks https://alienswap.xyz/assets/zkfair/0x84410cbfd1e48f4df8bddd4931cb27c022f45e6e/1947
  const contractAddr = "0x84410cbfd1e48f4df8bddd4931cb27c022f45e6e";
  const contract = await ethers.getContractAt("ReservoirErc721", contractAddr);
  const tokenId = 1947;
  //owner 0xe2bDcBd4e830783Dc0f35619e298B92d7600e2b6
  const prevOwner = "0x0FE0E72d41A7E6C97EA977Ea1a749BEb4044b01D";

  const owner = await contract.ownerOf(tokenId);
  const approved = await contract.getApproved(tokenId);
  console.log(`Token ID: ${tokenId} 的 owner: ${owner} approved: ${approved}`);

  await checkApprovalForAll(contract, owner, asConduit);
  await checkApprovalForAll(contract, prevOwner, asConduit);

  await checkApprovalForAll(contract, owner, asMarket);
  await checkApprovalForAll(contract, prevOwner, asMarket);
};

const checkApprovalForAll = async (contract: any, owner: string, operator: string) => {
  const isApprovedForAll = await contract.isApprovedForAll(owner, operator);
  console.log(`owner: ${owner} isApprovedForAll: ${isApprovedForAll} to operator: ${operator} on contract: ${contract.address}`);
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

