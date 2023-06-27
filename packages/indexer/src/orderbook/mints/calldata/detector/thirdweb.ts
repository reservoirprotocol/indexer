import { Interface } from "@ethersproject/abi";
import { AddressZero, HashZero, MaxUint256 } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import { keccak256 } from "@ethersproject/keccak256";
import { keccak256 as solidityKeccak256 } from "@ethersproject/solidity";
import * as Sdk from "@reservoir0x/sdk";
import MerkleTree from "merkletreejs";

import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { bn } from "@/common/utils";
import { config } from "@/config/index";
import { Transaction } from "@/models/transactions";
import {
  CollectionMint,
  getCollectionMints,
  simulateAndUpsertCollectionMint,
} from "@/orderbook/mints";
import { fetchMetadata, getStatus, toSafeTimestamp } from "@/orderbook/mints/calldata/helpers";
import {
  AllowlistItem,
  allowlistExists,
  createAllowlist,
  getAllowlist,
} from "@/orderbook/mints/allowlists";

const STANDARD = "thirdweb";

export const extractByCollection = async (
  collection: string,
  tokenId?: string
): Promise<CollectionMint[]> => {
  const isERC1155 = Boolean(tokenId);

  const c = new Contract(
    collection,
    new Interface([
      ...["function contractURI() view returns (string)"],
      ...(isERC1155
        ? [
            "function getActiveClaimConditionId(uint256 tokenId) view returns (uint256)",
            `function getClaimConditionById(uint256 tokenId, uint256 conditionId) view returns (
              (
                uint256 startTimestamp,
                uint256 maxClaimableSupply,
                uint256 supplyClaimed,
                uint256 quantityLimitPerWallet,
                bytes32 merkleRoot,
                uint256 pricePerToken,
                address currency,
                string metadata
              )
            )`,
          ]
        : [
            "function getActiveClaimConditionId() view returns (uint256)",
            `function getClaimConditionById(uint256 conditionId) view returns (
              (
                uint256 startTimestamp,
                uint256 maxClaimableSupply,
                uint256 supplyClaimed,
                uint256 quantityLimitPerWallet,
                bytes32 merkleRoot,
                uint256 pricePerToken,
                address currency,
                string metadata
              )
            )`,
          ]),
    ]),
    baseProvider
  );

  const results: CollectionMint[] = [];
  try {
    // Thirdweb mints can have a single active stage at any particular time

    const claimConditionId = bn(
      isERC1155 ? await c.getActiveClaimConditionId(tokenId) : await c.getActiveClaimConditionId()
    ).toNumber();

    const claimCondition = isERC1155
      ? await c.getClaimConditionById(tokenId, claimConditionId)
      : await c.getClaimConditionById(claimConditionId);

    const currency = claimCondition.currency.toLowerCase();
    if (currency === Sdk.ZeroExV4.Addresses.Eth[config.chainId]) {
      const price = claimCondition.pricePerToken.toString();
      const maxMintsPerWallet = claimCondition.quantityLimitPerWallet.eq(0)
        ? null
        : claimCondition.quantityLimitPerWallet.toString();

      // Public sale
      if (claimCondition.merkleRoot === HashZero) {
        results.push({
          collection,
          contract: collection,
          stage: `claim-${claimConditionId}`,
          kind: "public",
          status: "open",
          standard: STANDARD,
          details: {
            tx: {
              to: collection,
              data: {
                // `claim`
                signature: isERC1155 ? "0x57bc3d78" : "0x84bb1e42",
                params: [
                  {
                    kind: "recipient",
                    abiType: "address",
                  },
                  isERC1155
                    ? {
                        kind: "unknown",
                        abiKind: "uint256",
                        abiValue: tokenId!,
                      }
                    : // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      (undefined as any),
                  {
                    kind: "quantity",
                    abiType: "uint256",
                  },
                  {
                    kind: "unknown",
                    abiType: "address",
                    abiValue: currency,
                  },
                  {
                    kind: "unknown",
                    abiType: "uint256",
                    abiValue: price,
                  },
                  {
                    kind: "unknown",
                    abiType: "(bytes32[],uint256,uint256,address)",
                    abiValue: [[HashZero], maxMintsPerWallet, price, currency],
                  },
                  {
                    kind: "unknown",
                    abiType: "bytes",
                    abiValue: "0x",
                  },
                ].filter(Boolean),
              },
            },
          },
          currency: Sdk.Common.Addresses.Eth[config.chainId],
          price,
          tokenId,
          maxMintsPerWallet,
          maxSupply: claimCondition.maxClaimableSupply.toString(),
          startTime: toSafeTimestamp(claimCondition.startTimestamp),
        });
      }

      // Allowlist sale
      if (claimCondition.merkleRoot !== HashZero) {
        let allowlistCreated = true;
        if (!(await allowlistExists(claimCondition.merkleRoot))) {
          // Fetch contract metadata
          const contractURI = await c.contractURI();
          const contractMetadata = await fetchMetadata(contractURI);

          // Fetch merkle root metadata
          const merkleURI = contractMetadata.merkle[claimCondition.merkleRoot];
          const merkleMetadata = await fetchMetadata(merkleURI);

          // Fetch merkle entries metadata
          const entriesURI = merkleMetadata.originalEntriesUri;
          const entriesMetadata = await fetchMetadata(entriesURI);

          const items: AllowlistItem[] = entriesMetadata.map(
            (e: { address: string; maxClaimable: string; price: string }) => ({
              address: e.address,
              maxMints: String(e.maxClaimable),
              price: e.price ?? price,
              actualPrice: e.price ?? price,
            })
          );

          if (generateMerkleTree(items).tree.getHexRoot() === claimCondition.merkleRoot) {
            await createAllowlist(claimCondition.merkleRoot, items);
          } else {
            allowlistCreated = false;
          }
        }

        if (allowlistCreated) {
          results.push({
            collection,
            contract: collection,
            stage: `claim-${claimConditionId}`,
            kind: "allowlist",
            status: "open",
            standard: STANDARD,
            details: {
              tx: {
                to: collection,
                data: {
                  // `claim`
                  signature: isERC1155 ? "0x57bc3d78" : "0x84bb1e42",
                  params: [
                    {
                      kind: "recipient",
                      abiType: "address",
                    },
                    isERC1155
                      ? {
                          kind: "unknown",
                          abiKind: "uint256",
                          abiValue: tokenId!,
                        }
                      : // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        (undefined as any),
                    {
                      kind: "quantity",
                      abiType: "uint256",
                    },
                    {
                      kind: "unknown",
                      abiType: "address",
                      abiValue: Sdk.ZeroExV4.Addresses.Eth[config.chainId],
                    },
                    {
                      kind: "allowlist",
                      abiType: "uint256",
                    },
                    {
                      kind: "allowlist",
                      abiType: "(bytes32[],uint256,uint256,address)",
                    },
                    {
                      kind: "unknown",
                      abiType: "bytes",
                      abiValue: "0x",
                    },
                  ].filter(Boolean),
                },
              },
            },
            currency: Sdk.Common.Addresses.Eth[config.chainId],
            tokenId,
            maxSupply: claimCondition.maxClaimableSupply.toString(),
            startTime: toSafeTimestamp(claimCondition.startTimestamp),
            allowlistId: claimCondition.merkleRoot,
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
      cm.status = await getStatus(cm);
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
      "0x84bb1e42", // `claim` (ERC721)
      "0x57bc3d78", // `claim` (ERC1155)
    ].some((bytes4) => tx.data.startsWith(bytes4))
  ) {
    const isERC1155 = tx.data.startsWith("0x57bc3d78");
    const tokenId: string | undefined = isERC1155
      ? new Interface([
          `
            function claim(
              address receiver,
              uint256 tokenId,
              uint256 quantity,
              address currency,
              uint256 pricePerToken,
              (
                bytes32[] proof,
                uint256 quantityLimitPerWallet,
                uint256 pricePerToken,
                address currency
              ) allowlistProof,
              bytes memory data
            )
          `,
        ])
          .decodeFunctionData("claim", tx.data)
          .tokenId.toString()
      : undefined;

    return extractByCollection(collection, tokenId);
  }

  return [];
};

export const refreshByCollection = async (collection: string) => {
  const existingCollectionMints = await getCollectionMints(collection, { standard: STANDARD });

  const uniqueTokenIds = [...new Set(existingCollectionMints.map(({ tokenId }) => tokenId))];
  for (const tokenId of uniqueTokenIds) {
    // Fetch and save/update the currently available mints
    const latestCollectionMints = await extractByCollection(collection, tokenId);
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
  }
};

const hashFn = (item: AllowlistItem) =>
  solidityKeccak256(
    ["address", "uint256", "uint256", "address"],
    [item.address, item.maxMints ?? 0, item.price ?? MaxUint256, AddressZero]
  );

const SHARD_NYBBLES = 2;
const generateMerkleTree = (
  items: AllowlistItem[]
): {
  shards: Record<string, AllowlistItem[]>;
  roots: Record<string, string>;
  tree: MerkleTree;
} => {
  // Reference:
  // https://github.com/thirdweb-dev/js/blob/1c7264b40330d068ece67df537a0f5db0f6aedca/packages/sdk/src/evm/common/sharded-merkle-tree.ts#L146C1-L190

  const shards: Record<string, AllowlistItem[]> = {};
  for (const item of items) {
    const shard = item.address.slice(2, 2 + SHARD_NYBBLES).toLowerCase();
    if (shards[shard] === undefined) {
      shards[shard] = [];
    }
    shards[shard].push(item);
  }

  const subTrees = Object.entries(shards).map(([shard, entries]) => [
    shard,
    new MerkleTree(entries.map(hashFn), keccak256, {
      sort: true,
    }).getHexRoot(),
  ]);

  const roots = Object.fromEntries(subTrees);
  return {
    roots,
    shards,
    tree: new MerkleTree(Object.values(roots), keccak256, {
      sort: true,
    }),
  };
};

type ProofValue = [string[], string, string, string];

export const generateProofValue = async (
  collectionMint: CollectionMint,
  address: string
): Promise<ProofValue> => {
  const items = await getAllowlist(collectionMint.allowlistId!);

  const { roots, shards, tree } = generateMerkleTree(items);

  const shardId = address.slice(2, 2 + SHARD_NYBBLES).toLowerCase();
  const shardProof = tree.getHexProof(roots[shardId]);

  const shardItems = shards[shardId];
  const shardTree = new MerkleTree(shardItems.map(hashFn), keccak256, {
    sort: true,
  });

  const item = items.find((i) => i.address === address)!;
  const itemProof = shardTree.getHexProof(hashFn(item));
  return [
    itemProof.concat(shardProof),
    item.maxMints ?? "0",
    item.price ?? MaxUint256.toString(),
    AddressZero,
  ];
};
