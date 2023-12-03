import { Interface } from "@ethersproject/abi";
import { AddressZero, HashZero, MaxUint256 } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import { keccak256 } from "@ethersproject/keccak256";
import { keccak256 as solidityKeccak256 } from "@ethersproject/solidity";
import * as Sdk from "@reservoir0x/sdk";
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
  fetchMetadata,
  getStatus,
  toSafeNumber,
  toSafeTimestamp,
} from "@/orderbook/mints/calldata/helpers";
import {
  AllowlistItem,
  allowlistExists,
  createAllowlist,
  getAllowlist,
} from "@/orderbook/mints/allowlists";

const STANDARD = "thirdweb";

const NATIVE_CURRENCY = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

export const extractByCollectionERC721 = async (collection: string): Promise<CollectionMint[]> => {
  const c = new Contract(
    collection,
    new Interface([
      "function contractURI() view returns (string)",
      `function claimCondition() view returns (
        (
          uint256 currentStartId,
          uint256 count
        )
      )`,
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
    baseProvider
  );

  const results: CollectionMint[] = [];
  try {
    const { currentStartId, count } = await c.claimCondition();

    for (
      let claimConditionId = currentStartId.toNumber();
      claimConditionId < Math.min(currentStartId.toNumber() + count.toNumber(), 10);
      claimConditionId++
    ) {
      const claimCondition = await c.getClaimConditionById(claimConditionId);

      const currency = claimCondition.currency.toLowerCase();
      if (currency === NATIVE_CURRENCY) {
        const price = claimCondition.pricePerToken.toString();

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
                  signature: "0x84bb1e42",
                  params: [
                    {
                      kind: "recipient",
                      abiType: "address",
                    },
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
                      abiValue: [
                        [HashZero],
                        claimCondition.quantityLimitPerWallet.toString() ?? 0,
                        price,
                        currency,
                      ],
                    },
                    {
                      kind: "unknown",
                      abiType: "bytes",
                      abiValue: "0x",
                    },
                  ],
                },
              },
            },
            currency: Sdk.Common.Addresses.Native[config.chainId],
            price,
            maxMintsPerWallet: toSafeNumber(claimCondition.quantityLimitPerWallet),
            maxSupply: toSafeNumber(claimCondition.maxClaimableSupply),
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
                price: e.price,
                actualPrice: e.price,
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
                    signature: "0x84bb1e42",
                    params: [
                      {
                        kind: "recipient",
                        abiType: "address",
                      },
                      {
                        kind: "quantity",
                        abiType: "uint256",
                      },
                      {
                        kind: "unknown",
                        abiType: "address",
                        abiValue: NATIVE_CURRENCY,
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
                    ],
                  },
                },
              },
              currency: Sdk.Common.Addresses.Native[config.chainId],
              maxSupply: toSafeNumber(claimCondition.maxClaimableSupply),
              startTime: toSafeTimestamp(claimCondition.startTimestamp),
              allowlistId: claimCondition.merkleRoot,
            });
          }
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

export const extractByCollectionERC1155 = async (
  collection: string,
  tokenId: string
): Promise<CollectionMint[]> => {
  const c = new Contract(
    collection,
    new Interface([
      "function contractURI() view returns (string)",
      `function claimCondition(uint256 tokenId) view returns (
        (
          uint256 currentStartId,
          uint256 count
        )
      )`,
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
    ]),
    baseProvider
  );

  const results: CollectionMint[] = [];
  try {
    const { currentStartId, count } = await c.claimCondition(tokenId);

    for (
      let claimConditionId = currentStartId.toNumber();
      claimConditionId < Math.min(currentStartId.toNumber() + count.toNumber(), 10);
      claimConditionId++
    ) {
      const claimCondition = await c.getClaimConditionById(tokenId, claimConditionId);

      const currency = claimCondition.currency.toLowerCase();
      if (currency === NATIVE_CURRENCY) {
        const price = claimCondition.pricePerToken.toString();

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
                  signature: "0x57bc3d78",
                  params: [
                    {
                      kind: "recipient",
                      abiType: "address",
                    },
                    {
                      kind: "unknown",
                      abiType: "uint256",
                      abiValue: tokenId,
                    },
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
                      abiValue: [
                        [HashZero],
                        claimCondition.quantityLimitPerWallet ?? 0,
                        price,
                        currency,
                      ],
                    },
                    {
                      kind: "unknown",
                      abiType: "bytes",
                      abiValue: "0x",
                    },
                  ],
                },
              },
            },
            currency: Sdk.Common.Addresses.Native[config.chainId],
            price,
            tokenId,
            maxMintsPerWallet: toSafeNumber(claimCondition.quantityLimitPerWallet),
            maxSupply: toSafeNumber(claimCondition.maxClaimableSupply),
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
                price: e.price,
                actualPrice: e.price,
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
                    signature: "0x57bc3d78",
                    params: [
                      {
                        kind: "recipient",
                        abiType: "address",
                      },
                      {
                        kind: "unknown",
                        abiType: "uint256",
                        abiValue: tokenId,
                      },
                      {
                        kind: "quantity",
                        abiType: "uint256",
                      },
                      {
                        kind: "unknown",
                        abiType: "address",
                        abiValue: NATIVE_CURRENCY,
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
                    ],
                  },
                },
              },
              currency: Sdk.Common.Addresses.Native[config.chainId],
              tokenId,
              maxSupply: toSafeNumber(claimCondition.quantityLimitPerWallet),
              startTime: toSafeTimestamp(claimCondition.startTimestamp),
              allowlistId: claimCondition.merkleRoot,
            });
          }
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
  // ERC721
  if (
    [
      "0x84bb1e42", // `claim`
    ].some((bytes4) => tx.data.startsWith(bytes4))
  ) {
    return extractByCollectionERC721(collection);
  }

  // ERC1155
  if (
    [
      "0x57bc3d78", // `claim`
    ].some((bytes4) => tx.data.startsWith(bytes4))
  ) {
    const tokenId = new Interface([
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
      .tokenId.toString();

    return extractByCollectionERC1155(collection, tokenId);
  }

  return [];
};

export const refreshByCollection = async (collection: string) => {
  const existingCollectionMints = await getCollectionMints(collection, { standard: STANDARD });

  for (const { tokenId } of existingCollectionMints) {
    // Fetch and save/update the currently available mints
    const latestCollectionMints = tokenId
      ? await extractByCollectionERC1155(collection, tokenId)
      : await extractByCollectionERC721(collection);
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
