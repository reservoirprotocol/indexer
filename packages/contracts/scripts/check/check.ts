
import hre, { ethers } from "hardhat";
import axios from "axios";
import _ from "lodash";

// const asConduit = "0x24Ae55A1F64DBCfD687E2BcCAdD5499c87A5C5d9";

// to fix
// 数量不匹配 链上 1011
// https://scan.zkfair.io/token/0x4087fb91a1fbdef05761c02714335d232a2bf3a1/token-transfers
// 0x4087fb91a1fbdef05761c02714335d232a2bf3a1 |  1005 


const errTokenIds = [
  10,
];
const errConract = "0x96f2b371d800bf32bb89dad05b61b380030030a5";

const main = async () => {
  // await getTokenTransferLogs(errConract, 10);
  // process.exit(0);

  // const blocks = await getTokensBlocks(errConract, errTokenIds);
  // console.log("blocks: ", JSON.stringify(blocks, null, 2));

  // _.each(blocks, async (b) => {
  //   console.log(`retryAdminHandle blockNum: ${b}`);
  //   const res = await retryAdminHandle(b);
  //   console.log(`====retryAdminHandle blockNum: ${b} res: ${JSON.stringify(res, null, 2)}`);
  //   await asyncSeleep(3000);
  // });

  // console.log("=====done");
  // await asyncSeleep(1000 * 60 * 5);

  // process.exit(0);

  // how to avoid erc1155 ?
  // \x2f103ec022a1d99291077a082b2dc24c734e58a3
  // \x0ad3140394512d951ae86ee1562c1c925e13218a

  const sizeLimit = 2000;
  const includeCollections = [
    errConract,
  ];
  const excludedCollections = [
  ];

  const collections = await getCollections();

  console.log(`collections size: ${_.isArray(collections) ? collections.length : 0}`);
  for (const col of collections) {
    const contractAddr = col.contract;
    const contract = await ethers.getContractAt("ReservoirErc721", contractAddr);

    if (includeCollections.includes(contractAddr)) {
      console.log(`[info] check col contract: ${contractAddr} name: ${col.name}  collectionId: ${col.collectionId}`);
    } else {
      continue;
      // if (totalSupply > sizeLimit || excludedCollections.includes(contractAddr)) {
      //   console.log(`[warning] Skip col contract: ${contractAddr} totalSupply: ${totalSupply} name: ${col.name}  collectionId: ${col.collectionId}`);
      //   continue;
      // }
    }

    let totalSupply = 0;
    try {
      totalSupply = await contract.totalSupply();
    } catch (error) {
      console.log(`[error] No totalSupply Skip col contract: ${contractAddr} name: ${col.name}  collectionId: ${col.collectionId}`);
      continue;
    }

    console.log(`[info] check col contract: ${contractAddr} totalSupply: ${totalSupply} name: ${col.name}  collectionId: ${col.collectionId}`);

    await checkCollectionOwnershipRange(contract, 0, totalSupply)
  }

  console.log("=====done");
};

const checkCollectionOwnershipRange = async (contract: any, fromId: number, toId: number) => {
  const contractAddr = contract.address;
  const tokenIds = _.range(fromId, toId);
  console.log(`\ncheck collection contract: ${contractAddr} tokenId Range: ${fromId} ~ ${toId}`);

  for (const tokenId of tokenIds) {
    // // todo: remove
    // if (tokenId < 17542 || tokenId > 17572) {
    //   continue
    // }
    if (!errTokenIds.includes(tokenId)) {
      continue;
    }

    console.log(`\n${new Date().toISOString()} Token ID: ${tokenId} contractAddr: ${contractAddr}`);

    let owner = "0x";
    try {
      owner = await contract.ownerOf(tokenId);
    } catch (error) {
      // burnt or non-existent token
      // ERC721: owner query for nonexistent token
      if (error.message.includes("owner query for nonexistent token")) {
        console.log(`[warning] non-existent token ID: ${tokenId}`);
        // local return 0x only
        // owner = "0x0000000000000000000000000000000000000000";
        owner = "0x";
      } else {
        console.log(`\n[error] checkCollectionOwnershipRange tokenId=${tokenId} error: ${error}`);
        continue;
      }
    }

    const localOwner = await getLocalOwner(contractAddr, tokenId);
    if (owner.toLocaleLowerCase() !== localOwner.toLocaleLowerCase()) {
      console.log(`=====>[error] Token ID: ${tokenId} owner mismatch, local owner: ${localOwner} chain owner: ${owner}`);
    } else {
      console.log(`[OK] Token ID: ${tokenId} owner matched, owner: ${localOwner}`);
    }

    await asyncSeleep(10);
  }
};

const asyncSeleep = async (ms: number) => {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

const retryAdminHandle = async (blockNum: number) => {
  //   curl -X 'POST' \
  //   'http://localhost:30100/admin/sync-events-realtime' \
  //   -H 'accept: application/json' \
  //   -H 'x-admin-api-key: admZkFairApiHc232zKaczde12303232389323' \
  //   -H 'Content-Type: application/json' \
  //   -d '{
  //  "fromBlock": 4591993,
  //  "toBlock": 4591993
  //  }'
  const url = "http://localhost:30100/admin/sync-events-realtime";
  console.log(`retryAdminHandle blockNum: ${blockNum} url: ${url}`);
  const data = {
    fromBlock: blockNum,
    toBlock: blockNum,
  };
  const res = await axios.post(url, data, {
    headers: {
      "x-admin-api-key": "admZkFairApiHc232zKaczde12303232389323",
    },
  });
  return res.data;
};

const getTokensBlocks = async (contractAddr: string, tokenIds: number[]) => {
  const blocks = [];
  for (const tokenId of tokenIds) {
    const tokenBlocks = await getTokenTransferLogs(contractAddr, tokenId);
    const maxBlock = _.maxBy(tokenBlocks, (block) => block.blockNumber);
    blocks.push(maxBlock?.blockNumber);
  }
  const blockNums = _.uniq(blocks);
  return blockNums;
};

// todo use ethers
function toFixedHexString(num: number, width: number): string {
  // const hexString = toHexString(num);
  const hexString = num.toString(16);
  return "0x" + "0".repeat(width - hexString.length) + hexString.toLocaleLowerCase();
}

// curl 'https://dev-rpc.zkfair.io' -X POST --data '
// {
//   "id": 0,
//   "jsonrpc": "2.0",
//   "method": "eth_getLogs",
//   "params": [
//     {
//       "address": "0x828fa47d6b078f00a7728ab6bba2a10832e14491",
//       "fromBlock": "earliest",
//       "toBlock": "latest",
//       "topics": [
//         "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
//         [],
//         [],
//         "0x0000000000000000000000000000000000000000000000000000000000001e8f"
//       ]
//     }
//   ]
// }
// ' 
const rpc = "https://dev-rpc.zkfair.io";
const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const getTokenTransferLogs = async (contractAddr: string, tokenId: number) => {
  const tokenIdTopic = toFixedHexString(tokenId, 64);

  try {
    const res = await axios.post(rpc,
      {
        "id": 0,
        "jsonrpc": "2.0",
        "method": "eth_getLogs",
        "params": [
          {
            "address": contractAddr,
            "fromBlock": "earliest",
            "toBlock": "latest",
            "topics": [
              transferTopic,
              [],
              [],
              tokenIdTopic
            ]
          }
        ]
      }
    );
    console.log(`getTokenTransferLogs tokenId: ${tokenId} res: ${JSON.stringify(res.data, null, 2)}`);

    // {
    //   "address": "0x828fa47d6b078f00a7728ab6bba2a10832e14491",
    //   "topics": [
    //     "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
    //     "0x000000000000000000000000de63d456a209542f760e1561a92e270dde982cd9",
    //     "0x000000000000000000000000f4a102a76cac03bfaae10a428994b83e71334816",
    //     "0x0000000000000000000000000000000000000000000000000000000000001e8f"
    //   ],
    //   "data": "0x",
    //   "blockNumber": "0x3ed0a7",
    //   "transactionHash": "0xd94799beb7a2a7d7aa2d84ed4cc91333473114748d1fcae1bbdbe135f65736bf",
    //   "transactionIndex": "0x0",
    //   "blockHash": "0xb770485362be58c8cc6dcfdb1facf47abe4a6a4db0b645b9aa255b6c443b2af8",
    //   "logIndex": "0x3",
    //   "removed": false
    // }
    const blocks = _.map(res.data.result, (log: any) => {
      return {
        blockNumber: parseInt(log.blockNumber, 16),
        blockHex: log.blockNumber,
        transactionHash: log.transactionHash,
        transactionIndex: parseInt(log.transactionIndex, 16),
        blockHash: log.blockHash,
        logIndex: parseInt(log.logIndex, 16),
        removed: log.removed,
        from: log.topics[1],
        to: log.topics[2],
        tokenId: tokenId,
      };
    });
    return blocks;
  } catch (error) {
    console.log(`\n[error]!!! getTokenTransferLogs error: ${error}`);
    return [];
  };
};

// https://api-zkfair-mainnet.alienswap.xyz/owners/v2?token=0x84410cbfd1e48f4df8bddd4931cb27c022f45e6e:1947&offset=0&limit=2
const ownerBaseUrl = "http://localhost:30100/owners/v2";

const getLocalOwner = async (contract: string, tokenId: number) => {
  const url = `${ownerBaseUrl}?token=${contract}:${tokenId}&offset=0&limit=2`;
  // console.log(`getLocalOwner from url: ${url}`);
  try {
    const resp = await axios.get(url);
    return resp.data.owners[0]?.address ?? "0x";
  } catch (error) {
    console.log(`\n[error]!!! getLocalOwner error: ${error}`);
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


// name                    | token_count |                   concat
// --------------------------------------------+-------------+--------------------------------------------
//  Fair Fight                                 |       33698 | 0x828fa47d6b078f00a7728ab6bba2a10832e14491
//  ZKFair Frogs                               |       10000 | 0x48018a45a18a08a9616576f50fbff7eeb5ddb974
//  ZKFair Punks                               |        3899 | 0x84410cbfd1e48f4df8bddd4931cb27c022f45e6e
//  iZiSwap Liquidity NFT                      |        1278 | 0x110de362cc436d7f54210f96b8c7652c2617887d
//  .fairchat                                  |        1004 | 0x4087fb91a1fbdef05761c02714335d232a2bf3a1
//  IVY ERC721 NFT                             |         714 | 0xe6626460c41480e99068f926dbdca4652aba1616
//  ZKF Rocks                                  |         508 | 0xe8bee9d199392f98c102f3b234e0281cb295dbf7
//  Battledog                                  |         269 | 0x96f2b371d800bf32bb89dad05b61b380030030a5
//                                             |         169 | 0x6874485d3f49ed7e9766230c6b04f9e1353bc40a
//  IVY ERC721 NFT                             |         105 | 0xcbd627c3d249b5d5b4d83df27fe419538004cb19
//  Fairchat.xyz Posts                         |          79 | 0x2f103ec022a1d99291077a082b2dc24c734e58a3
//  InfinityImagery                            |          61 | 0xf19fa9ab9da97111dc2f868c56a778c918fb362b
//  Dragon Crypto New Year                     |          47 | 0x02bac4afc24a1b75a90d579360a9a1874043fbe2
//  OkNFT                                      |          19 | 0x4a1b0b3c32f4eef3d332d2a44348c73d4a63f587
//  Jai Kae Rae                                |          16 | 0xc14f462e63f36d9be62b2fbb7595e844d3bc18ee
//  Fairchat Launchpad                         |          15 | 0x0bfd104ee283d56f0526e8551fd9af8e4555cfc9
//  0x19c3e107f6967d7a58faaa78d1b7bebb54bed2e6 |          11 | 0x19c3e107f6967d7a58faaa78d1b7bebb54bed2e6
//  Just Mint 👀                                |          10 | 0x5e70fdd5139f443242bb85b24f0e3023e0b7576c
//  Catinals                                   |          10 | 0x817c7b5f41c08dceb792afdef40d2f3d4bc9fdbc
//  ZKFairToadz                                |          10 | 0x3289d770cdb7520c39d779165f78b177c764d808
//  ZKFair Frogs                               |           8 | 0x456b326816e86f1707af6827897df998898630d6
//  0x0ad3140394512d951ae86ee1562c1c925e13218a |           8 | 0x0ad3140394512d951ae86ee1562c1c925e13218a
//  Lezgooo 🚀                                  |           6 | 0x8aec64a420384ccf62b591bb39d96c04162975cd
//  ZKAbstract                                 |           4 | 0xe2f819f1bbad0ef64222775d4655173072b1b1c7
//  TEST                                       |           3 | 0x20dd3edcdf6d4f7889dd941b1fac68644462bafb
//  TESTING                                    |           1 | 0x827f73d7c0c4657bccc9d56a9cf4d9012a0b2995
//  Alphamint Tokens                           |           1 | 0x18334dadd6968ebbc50c9706b322dbd2e6a92bb7
//  ZKFair Frogs                               |           1 | 0x521665a7aefa86979b7cc251050bcf50148b5a5d
//  MyToken                                    |           1 | 0xfb3a12c6bdd094432f9b7825fac3c915e522faad
// (29 rows)