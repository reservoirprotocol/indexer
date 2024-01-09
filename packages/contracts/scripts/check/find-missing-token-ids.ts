// import _ from "lodash";
// import * as fs from "fs";


import hre, { ethers } from "hardhat";
import axios from "axios";
import _ from "lodash";
import { testIt } from "./common";

// const asConduit = "0x24Ae55A1F64DBCfD687E2BcCAdD5499c87A5C5d9";

const main = async () => {
  await testIt();
  // await getLocalOwner("0x84410cbfd1e48f4df8bddd4931cb27c022f45e6e", 0);
  // await checkCollectionOwnership("0x84410cbfd1e48f4df8bddd4931cb27c022f45e6e", null);
  // process.exit(0);

  // const tokenIds = _.range(0, 3898);

  // const itemsFile = fs.readFileSync("./scripts/check/nft_balances_202401052201.json", "utf8");

  // const dbTokenIds: {
  //   token_id: number,
  // }[] = JSON.parse(itemsFile).items;

  // const localIds = _.map(dbTokenIds, (item) => item.token_id);
  // const missingIds = _.difference(tokenIds, localIds);


  // const collections = await getCollections();
  // console.log(`collections size: ${_.isArray(collections) ? collections.length : 0}`);

  // for (const col of collections) {
  //   await checkCollectionOwnership(col.contract, col);
  // }
};

const checkCollectionOwnership = async (contractAddr: string, col: any) => {
  const contract = await ethers.getContractAt("ReservoirErc721", contractAddr);
  const totalSupply = await contract.totalSupply();
  const tokenIds = _.range(0, Number(totalSupply));
  if (col) {
    console.log(`col contract: ${contractAddr} totalSupply: ${totalSupply} name: ${col.name}  collectionId: ${col.collectionId}`);
  } else {
    console.log(`col contract: ${contractAddr} totalSupply: ${totalSupply}`);
  }

  for (const tokenId of tokenIds) {
    const owner = await contract.ownerOf(tokenId);
    const localOwner = await getLocalOwner(contractAddr, tokenId);
    console.log(`\n${new Date().toISOString()} Token ID: ${tokenId} owner: ${owner} localOwner: ${localOwner}`);
    if (owner.toLocaleLowerCase() !== localOwner.toLocaleLowerCase()) {
      console.log(`=====>[error] Token ID: ${tokenId} owner mismatch, local owner: ${localOwner} chain owner: ${owner}`);
    } else {
      console.log(`[OK] Token ID: ${tokenId} owner matched, owner: ${localOwner}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }
};

const checkCollectionOwnershipRange = async (contract: any, fromId: number, toId: number) => {
  const contractAddr = contract.address;
  const tokenIds = _.range(fromId, toId);
  console.log(`check collection contract: ${contractAddr} tokenId Range: ${fromId} ~ ${toId}`);

  for (const tokenId of tokenIds) {
    const owner = await contract.ownerOf(tokenId);
    const localOwner = await getLocalOwner(contractAddr, tokenId);
    console.log(`\n${new Date().toISOString()} Token ID: ${tokenId} owner: ${owner} localOwner: ${localOwner}`);
    if (owner.toLocaleLowerCase() !== localOwner.toLocaleLowerCase()) {
      console.log(`=====>[error] Token ID: ${tokenId} owner mismatch, local owner: ${localOwner} chain owner: ${owner}`);
    } else {
      console.log(`[OK] Token ID: ${tokenId} owner matched, owner: ${localOwner}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }
};

// https://api-zkfair-mainnet.alienswap.xyz/owners/v2?token=0x84410cbfd1e48f4df8bddd4931cb27c022f45e6e:1947&offset=0&limit=2
const ownerBaseUrl = "http://localhost:30100/owners/v2";

const getLocalOwner = async (contract: string, tokenId: number) => {
  const url = `${ownerBaseUrl}?token=${contract}:${tokenId}&offset=0&limit=2`;
  // console.log(`getLocalOwner from url: ${url}`);
  try {
    const resp = await axios.get(url);
    return resp.data.owners[0].address;
  } catch (error) {
    console.log(`[error] getLocalOwner error: ${error}`);
    return "0x";
  }
};

// const colUrl = "https://api-zkfair-mainnet.alienswap.xyz/search/collections/v2?offset=0&limit=30";
// const colUrl = "https://api-zkfair-mainnet.alienswap.xyz/collections/v7?offset=0&limit=20";
// const colUrl = "https://api-zkfair-mainnet.alienswap.xyz/collections/v7";
// local proxy to avoid cf block
// const colUrl = "http://localhost:30100/collections/v7";
const colUrl = "http://localhost:30100/search/collections/v2?offset=0&limit=30";

const getCollections = async () => {
  const resp = await axios.get(colUrl, {
    // params: {
    //   offset: 0,
    //   limit: 20,
    // },
    // headers: {
    //   "x-api-key": "767862fc-6ff9-5dbc-a555-3e6fcaf8c21d",
    //   "Content-Type": "application/json",
    //   "user-agent":
    //     "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",

    //   // "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    //   "accept-language": "en,zh-CN;q=0.9,zh;q=0.8",
    //   "cache-control": "max-age=0",
    //   "sec-ch-ua": "\"Not_A Brand\";v=\"8\", \"Chromium\";v=\"120\", \"Google Chrome\";v=\"120\"",
    //   "sec-ch-ua-mobile": "?0",
    //   "sec-ch-ua-platform": "\"macOS\"",
    //   "sec-fetch-dest": "document",
    //   "sec-fetch-mode": "navigate",
    //   "sec-fetch-site": "none",
    //   "sec-fetch-user": "?1",
    //   "upgrade-insecure-requests": "1",
    //   // "cookie": "_ga=GA1.1.709047400.1704431109; cf_clearance=a6Nq_k9rlO.3lIztylVwEnlEqulxEo86xRfHE5MzKDw-1704612218-0-2-5e76a717.d09d7c94.977f8f7-0.2.1704612218; _ga_7ZE5XDVL6Z=GS1.1.1704612220.12.1.1704614751.0.0.0"
    // },
  });
  // console.log(resp.data);
  return resp.data.collections;

  // curl 'https://api-zkfair-mainnet.alienswap.xyz/search/collections/v2?offset=0&limit=30' \
  // -H 'authority: api-zkfair-mainnet.alienswap.xyz' \
  // -H 'accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7' \
  // -H 'accept-language: en,zh-CN;q=0.9,zh;q=0.8' \
  // -H 'cache-control: max-age=0' \
  // -H 'cookie: _ga=GA1.1.709047400.1704431109; cf_clearance=a6Nq_k9rlO.3lIztylVwEnlEqulxEo86xRfHE5MzKDw-1704612218-0-2-5e76a717.d09d7c94.977f8f7-0.2.1704612218; _ga_7ZE5XDVL6Z=GS1.1.1704612220.12.1.1704614751.0.0.0' \
  // -H 'sec-ch-ua: "Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"' \
  // -H 'sec-ch-ua-mobile: ?0' \
  // -H 'sec-ch-ua-platform: "macOS"' \
  // -H 'sec-fetch-dest: document' \
  // -H 'sec-fetch-mode: navigate' \
  // -H 'sec-fetch-site: none' \
  // -H 'sec-fetch-user: ?1' \
  // -H 'upgrade-insecure-requests: 1' \
  // -H 'user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' \
  // --compressed
};


main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });