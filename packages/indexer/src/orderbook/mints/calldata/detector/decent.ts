import { Interface } from "@ethersproject/abi";
import { HashZero, MaxUint256 } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import { keccak256 } from "@ethersproject/keccak256";
import { keccak256 as solidityKeccak256 } from "@ethersproject/solidity";
import { parseEther } from "@ethersproject/units";
import * as Sdk from "@reservoir0x/sdk";
import axios from "axios";
import MerkleTree from "merkletreejs";

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
  allowlistExists,
  createAllowlist,
  getAllowlist,
} from "@/orderbook/mints/allowlists";
import { getStatus, toSafeNumber, toSafeTimestamp } from "@/orderbook/mints/calldata/helpers";

const STANDARD = "decent";

export const extractByCollectionERC721 = async (collection: string): Promise<CollectionMint[]> => {
  const results: CollectionMint[] = [];

  // DCNT721A / DCNT4907A
  const v6Abi = new Interface([
    `function MAX_TOKENS() external view returns (uint256)`,
    `function tokenPrice() external view returns (uint256)`,
    `function maxTokenPurchase() external view returns (uint256)`,
    `function saleStart() external view returns (uint256)`,
    `function saleEnd() external view returns (uint256)`,
    `function royaltyBPS() external view returns (uint256)`,
    `function presaleStart() external view returns (uint256)`,
    `function presaleEnd() external view returns (uint256)`,
    `function presaleMerkleRoot() external view returns (bytes32)`,
  ]);
  const v8Abi = new Interface([
    `function MAX_TOKENS() external view returns (uint256)`,
    `
      function edition() external view returns (
        bool hasAdjustableCap,
        bool isSoulbound,
        uint32 maxTokens,
        uint32 maxTokenPurchase,
        uint32 presaleStart,
        uint32 presaleEnd,
        uint32 saleStart,
        uint32 saleEnd,
        uint16 royaltyBPS,
        uint96 tokenPrice,
        address payoutAddress,
        bytes32 presaleMerkleRoot
      )
    `,
  ]);

  const contract = new Contract(
    collection,
    new Interface([`function contractVersion() external view returns (uint32)`]),
    baseProvider
  );

  try {
    let editionConfig: {
      maxTokens: string;
      tokenPrice: string;
      maxTokenPurchase: string;
      saleStart: string;
      saleEnd: string;
      presaleStart: string;
      presaleEnd: string;
      presaleMerkleRoot: string;
    };

    const version = await contract.contractVersion();
    if (version < 8) {
      const nft = new Contract(collection, v6Abi, baseProvider);
      const [
        maxTokens,
        tokenPrice,
        maxTokenPurchase,
        saleStart,
        saleEnd,
        presaleStart,
        presaleEnd,
        presaleMerkleRoot,
      ] = await Promise.all([
        nft.MAX_TOKENS(),
        nft.tokenPrice(),
        nft.maxTokenPurchase(),
        nft.saleStart(),
        nft.saleEnd(),
        nft.presaleStart(),
        nft.presaleEnd(),
        nft.presaleMerkleRoot(),
      ]);

      editionConfig = {
        maxTokens: maxTokens.toString(),
        tokenPrice: tokenPrice.toString(),
        maxTokenPurchase: maxTokenPurchase.toString(),
        saleStart: saleStart.toString(),
        saleEnd: saleEnd.toString(),
        presaleStart: presaleStart.toString(),
        presaleEnd: presaleEnd.toString(),
        presaleMerkleRoot,
      };
    } else {
      const nft = new Contract(collection, v8Abi, baseProvider);
      const config = await nft.edition();

      editionConfig = {
        maxTokens: config.maxTokens.toString(),
        tokenPrice: config.tokenPrice.toString(),
        maxTokenPurchase: config.maxTokenPurchase.toString(),
        saleStart: config.saleStart.toString(),
        saleEnd: config.saleEnd.toString(),
        presaleStart: config.presaleStart.toString(),
        presaleEnd: config.presaleEnd.toString(),
        presaleMerkleRoot: config.presaleMerkleRoot,
      };
    }

    // Public sale
    if (editionConfig.saleStart !== "0" && editionConfig.saleEnd !== "0") {
      results.push({
        collection,
        contract: collection,
        stage: "public-sale",
        kind: "public",
        status: "open",
        standard: STANDARD,
        details: {
          tx: {
            to: collection,
            data: {
              // `mint`
              signature: "0x40c10f19",
              params: [
                {
                  kind: "recipient",
                  abiType: "address",
                },
                {
                  kind: "quantity",
                  abiType: "uint256",
                },
              ],
            },
          },
        },
        currency: Sdk.Common.Addresses.Native[config.chainId],
        price: editionConfig.tokenPrice,
        maxMintsPerWallet: toSafeNumber(editionConfig.maxTokenPurchase),
        maxSupply: toSafeNumber(editionConfig.maxTokens),
        startTime: toSafeTimestamp(editionConfig.saleStart),
        endTime: toSafeTimestamp(editionConfig.saleEnd),
      });
    }

    // Allowlist sale
    if (editionConfig.presaleMerkleRoot !== HashZero) {
      let allowlistCreated = true;
      if (!(await allowlistExists(editionConfig.presaleMerkleRoot))) {
        const { data } = await axios.get(
          `https://hq.decent.xyz/api/1.0/allowlists/${editionConfig.presaleMerkleRoot}`,
          {
            headers: {
              "X-Api-Key": "fee46c572acecfc76c8cb2a1498181f9",
            },
          }
        );

        const items: AllowlistItem[] = data.map(
          (e: { address: string; maxQuantity: number; pricePerToken: string }) => ({
            address: e.address,
            maxMints: String(e.maxQuantity),
            price: parseEther(String(e.pricePerToken)).toString(),
            actualPrice: parseEther(String(e.pricePerToken)).toString(),
          })
        );

        if (generateMerkleTree(items).tree.getHexRoot() === editionConfig.presaleMerkleRoot) {
          await createAllowlist(editionConfig.presaleMerkleRoot, items);
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
              to: collection,
              data: {
                // `mintPresale`
                signature: "0x727a612e",
                params: [
                  {
                    kind: "quantity",
                    abiType: "uint256",
                  },
                  {
                    kind: "allowlist",
                    abiType: "uint256",
                  },
                  {
                    kind: "allowlist",
                    abiType: "uint256",
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
          allowlistId: editionConfig.presaleMerkleRoot,
          maxSupply: toSafeNumber(editionConfig.maxTokens),
          startTime: toSafeTimestamp(editionConfig.presaleStart),
          endTime: toSafeTimestamp(editionConfig.presaleEnd),
        });
      }
    }
  } catch (error) {
    logger.error("mint-detector", JSON.stringify({ kind: STANDARD, error }));
  }

  // Update the status of each collection mint
  try {
    await Promise.all(
      results.map(async (cm) => {
        await getStatus(cm).then(({ status, reason }) => {
          cm.status = status;
          cm.statusReason = reason;
        });
      })
    );
  } catch {
    // Skip errors
  }

  return results;
};

export const extractByTx = async (
  collection: string,
  tx: Transaction
): Promise<CollectionMint[]> => {
  if (
    [
      "0x40c10f19", // `mint`
      "0x727a612e", // `mintPresale`
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

const hashFn = (item: AllowlistItem) =>
  solidityKeccak256(
    ["address", "uint256", "uint256"],
    [item.address, item.maxMints ?? 0, item.price ?? MaxUint256]
  );

const generateMerkleTree = (
  items: AllowlistItem[]
): {
  root: string;
  tree: MerkleTree;
} => {
  // Reference:
  // https://docs.decent.xyz/docs/editions#deploy

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
