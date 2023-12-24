import { Interface, Result } from "@ethersproject/abi";
import { hexZeroPad } from "@ethersproject/bytes";
import { HashZero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import { keccak256 } from "@ethersproject/keccak256";
import { keccak256 as solidityKeccak256 } from "@ethersproject/solidity";
import * as Sdk from "@reservoir0x/sdk";
import { MerkleTree } from "merkletreejs";

import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { config } from "@/config/index";
import { Transaction } from "@/models/transactions";
import {
  CollectionMint,
  getCollectionMints,
  simulateAndUpsertCollectionMint,
} from "@/orderbook/mints";
import {
  AllowlistItem,
  getAllowlist,
  allowlistExists,
  createAllowlist,
} from "@/orderbook/mints/allowlists";
import {
  fetchMetadata,
  getStatus,
  toSafeNumber,
  toSafeTimestamp,
} from "@/orderbook/mints/calldata/helpers";

const STANDARD = "foundation";

export const extractByCollectionERC721 = async (collection: string): Promise<CollectionMint[]> => {
  const results: CollectionMint[] = [];

  const contract = new Contract(
    Sdk.Foundation.Addresses.DropMarket[config.chainId],
    new Interface([
      `
        function getFixedPriceSale(address nftContract) view returns (
          address seller,
          uint256 price,
          uint256 limitPerAccount,
          uint256 numberOfTokensAvailableToMint,
          bool marketCanMint,
          uint256 generalAvailabilityStartTime,
          uint256 earlyAccessStartTime
        )
      `,
    ]),
    baseProvider
  );

  try {
    const result = await contract.getFixedPriceSale(collection);

    const editionConfig: {
      seller: string;
      price: string;
      limitPerAccount: string;
      numberOfTokensAvailableToMint: string;
      marketCanMint: boolean;
      generalAvailabilityStartTime: string;
      earlyAccessStartTime: string;
    } = {
      seller: result.seller,
      price: result.price.toString(),
      limitPerAccount: result.limitPerAccount.toString(),
      numberOfTokensAvailableToMint: result.numberOfTokensAvailableToMint.toString(),
      marketCanMint: result.marketCanMint,
      generalAvailabilityStartTime: result.generalAvailabilityStartTime.toString(),
      earlyAccessStartTime: result.earlyAccessStartTime.toString(),
    };

    // Public sale
    results.push({
      collection,
      contract: collection,
      stage: "public-sale",
      kind: "public",
      status: result.marketCanMint ? "open" : "closed",
      standard: STANDARD,
      details: {
        tx: {
          to: Sdk.Foundation.Addresses.DropMarket[config.chainId],
          data: {
            // `mintFromFixedPriceSale`
            signature: "0xecbc9554",
            params: [
              {
                kind: "contract",
                abiType: "address",
              },
              {
                kind: "quantity",
                abiType: "uint256",
              },
              {
                kind: "referrer",
                abiType: "address",
              },
            ],
          },
        },
      },
      currency: Sdk.Common.Addresses.Native[config.chainId],
      price: editionConfig.price,
      maxMintsPerWallet: toSafeNumber(editionConfig.limitPerAccount),
      maxSupply: toSafeNumber(editionConfig.numberOfTokensAvailableToMint),
      startTime: toSafeTimestamp(editionConfig.generalAvailabilityStartTime),
    });

    // Allowlist mint
    if (result.earlyAccessStartTime != "0") {
      const { merkleRoot, merkleTreeUri } = await getLatestMerkleRootData(collection);
      if (merkleRoot && merkleRoot !== HashZero && merkleTreeUri && merkleTreeUri !== "") {
        let allowlistCreated = true;
        if (!(await allowlistExists(merkleRoot))) {
          const contractMetadata: { unhashedLeaves: string[] } = await fetchMetadata(merkleTreeUri);
          const items: AllowlistItem[] = contractMetadata.unhashedLeaves.map(
            (e) =>
              ({
                address: e,
                price: editionConfig.price,
                actualPrice: editionConfig.price,
              } as AllowlistItem)
          );

          if (generateMerkleTree(items).tree.getHexRoot() === merkleRoot) {
            await createAllowlist(merkleRoot!, items);
          } else {
            allowlistCreated = false;
          }
        }

        if (allowlistCreated) {
          results.push({
            collection,
            contract: collection,
            stage: "presale",
            kind: "allowlist",
            status: "open",
            standard: STANDARD,
            details: {
              tx: {
                to: Sdk.Foundation.Addresses.DropMarket[config.chainId],
                data: {
                  // `mintFromFixedPriceSaleWithEarlyAccessAllowlist`
                  signature: "0xd782d491",
                  params: [
                    {
                      kind: "contract",
                      abiType: "address",
                    },
                    {
                      kind: "quantity",
                      abiType: "uint256",
                    },
                    {
                      kind: "referrer",
                      abiType: "address",
                    },
                    {
                      kind: "allowlist",
                      abiType: "bytes32[]",
                    },
                  ],
                },
              },
            },
            currency: Sdk.Common.Addresses.Native[config.chainId],
            price: editionConfig.price,
            maxMintsPerWallet: toSafeNumber(editionConfig.limitPerAccount),
            maxSupply: toSafeNumber(editionConfig.numberOfTokensAvailableToMint),
            startTime: toSafeTimestamp(editionConfig.earlyAccessStartTime),
            allowlistId: merkleRoot,
          });
        }
      }
    }
  } catch (error) {
    logger.error("mint-detector", JSON.stringify({ kind: STANDARD, error }));
  }

  // Update the status of each collection mint
  await Promise.all(
    results.map(async (cm) => {
      await getStatus(cm).then(({ status, reason }) => {
        cm.status = status;
        cm.statusReason = reason;
      });
    })
  );

  return results;
};

export const extractByTx = async (
  collection: string,
  tx: Transaction
): Promise<CollectionMint[]> => {
  if (
    [
      "0xecbc9554", // `mintFromFixedPriceSale`
      "0xd782d491", // `mintFromFixedPriceSaleWithEarlyAccessAllowlist`
    ].some((bytes4) => tx.data.startsWith(bytes4))
  ) {
    return extractByCollectionERC721(collection);
  }

  return [];
};

export const refreshByCollection = async (collection: string) => {
  const existingCollectionMints = await getCollectionMints(collection, { standard: STANDARD });

  // Fetch and save/update the currently available mints
  const latestCollectionMints = await extractByCollectionERC721(collection);
  for (const collectionMint of latestCollectionMints) {
    await simulateAndUpsertCollectionMint(collectionMint);
  }

  // Assume anything that exists in our system but was not returned
  // in the above call is not available anymore so we can close
  for (const existing of existingCollectionMints) {
    if (
      !latestCollectionMints.find(
        (latest) =>
          latest.collection === existing.collection &&
          latest.stage === existing.stage &&
          latest.tokenId === existing.tokenId
      )
    ) {
      await simulateAndUpsertCollectionMint({
        ...existing,
        status: "closed",
      });
    }
  }
};

const hashFn = (item: AllowlistItem) => solidityKeccak256(["address"], [item.address]);

const generateMerkleTree = (
  items: AllowlistItem[]
): {
  root: string;
  tree: MerkleTree;
} => {
  const tree = new MerkleTree(items.map(hashFn), keccak256, {
    sortPairs: true,
  });
  return {
    root: tree.getHexRoot(),
    tree,
  };
};

type ProofValue = string[];

export const generateProofValue = async (
  collectionMint: CollectionMint,
  address: string
): Promise<ProofValue> => {
  const items = await getAllowlist(collectionMint.allowlistId!);
  const item = items.find((i) => i.address === address)!;
  return generateMerkleTree(items).tree.getHexProof(hashFn(item));
};

const getLatestMerkleRootData = async (collection: string, maxRetry = 5, blockInterval = 10000) => {
  const iface = new Interface([
    `event CreateFixedPriceSale(
      address indexed nftContract,
      address indexed seller,
      uint256 price,
      uint256 limitPerAccount,
      uint256 generalAvailabilityStartTime,
      uint256 earlyAccessStartTime,
      bytes32 merkleRoot,
      string merkleTreeUri
    )`,
    `event AddMerkleRootToFixedPriceSale(
      address indexed nftContract,
      bytes32 merkleRoot,
      string merkleTreeUri
    )`,
  ]);

  const blockNumber = await baseProvider.getBlockNumber();
  const topicsFilter = [
    [
      iface.getEventTopic("CreateFixedPriceSale"),
      iface.getEventTopic("AddMerkleRootToFixedPriceSale"),
    ],
    hexZeroPad(collection, 32),
  ];

  let merkleRoot: string | undefined;
  let merkleTreeUri: string | undefined;
  for (let i = 0; i < maxRetry; i++) {
    const relevantLogs = await baseProvider.getLogs({
      fromBlock: blockNumber - blockInterval * (i + 1),
      toBlock: blockNumber - blockInterval * i,
      topics: topicsFilter,
    });

    if (relevantLogs.length) {
      const mostRecentLog = relevantLogs[relevantLogs.length - 1];

      let decodedLog: Result;
      if (mostRecentLog.topics[0] === iface.getEventTopic("CreateFixedPriceSale")) {
        decodedLog = iface.decodeEventLog(
          "CreateFixedPriceSale",
          mostRecentLog.data,
          mostRecentLog.topics
        );
      } else {
        decodedLog = iface.decodeEventLog(
          "AddMerkleRootToFixedPriceSale",
          mostRecentLog.data,
          mostRecentLog.topics
        );
      }

      merkleTreeUri = decodedLog.merkleTreeUri;
      merkleRoot = decodedLog.merkleRoot;

      break;
    }
  }

  return {
    merkleRoot,
    merkleTreeUri,
  };
};
