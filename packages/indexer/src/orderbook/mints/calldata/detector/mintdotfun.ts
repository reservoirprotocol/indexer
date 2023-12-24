import { Interface } from "@ethersproject/abi";
import { Contract } from "@ethersproject/contracts";
import * as Sdk from "@reservoir0x/sdk";
import axios from "axios";

import { baseProvider } from "@/common/provider";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import { Transaction } from "@/models/transactions";
import {
  CollectionMint,
  getCollectionMints,
  simulateAndUpsertCollectionMint,
} from "@/orderbook/mints";

const STANDARD = "mintdotfun";

const MINT_DOT_FUN_DEPLOYER = "0x56d7303fb0d0781c2fbef962d7f9461bf416916f";

export const extractByCollection = async (collection: string): Promise<CollectionMint[]> => {
  const results: CollectionMint[] = [];
  try {
    const nft = new Contract(
      collection,
      new Interface([
        "function name() external view returns (string)",
        "function owner() external view returns (address)",
        "function mintOpen() external view returns (bool)",
      ]),
      baseProvider
    );

    const mintOpen = await nft.mintOpen();
    const owner = await nft.owner().then((o: string) => o.toLowerCase());
    const name = await nft.name();
    if (owner === MINT_DOT_FUN_DEPLOYER && name.includes("fundrop")) {
      results.push({
        collection,
        contract: collection,
        stage: "allowlist-sale",
        kind: "allowlist",
        status: mintOpen ? "open" : "closed",
        standard: STANDARD,
        details: {
          tx: {
            to: collection,
            data: {
              // `mint`
              signature: "0xb510391f",
              params: [
                {
                  kind: "referrer",
                  abiType: "address",
                },
                {
                  kind: "allowlist",
                  abiType: "bytes",
                },
              ],
            },
          },
        },
        currency: Sdk.Common.Addresses.Native[config.chainId],
        price: "0",
        maxMintsPerWallet: "1",
      });
    }
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
      "0xb510391f", // `mint`
    ].some((bytes4) => tx.data.startsWith(bytes4))
  ) {
    return extractByCollection(collection);
  }

  return [];
};

export const refreshByCollection = async (collection: string) => {
  const existingCollectionMints = await getCollectionMints(collection, { standard: STANDARD });

  for (const { collection } of existingCollectionMints) {
    // Fetch and save/update the currently available mints
    const latestCollectionMints = await extractByCollection(collection);
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

type ProofValue = string;

export const generateProofValue = async (
  collectionMint: CollectionMint,
  address: string,
  referrer: string
): Promise<ProofValue> => {
  const cacheKey = `${collectionMint.collection}-${collectionMint.stage}-${address}`;

  let result: ProofValue = await redis
    .get(cacheKey)
    .then((response) => (response ? JSON.parse(response) : undefined));
  if (!result) {
    result = await axios
      .get(`https://mint.fun/api/mintfun/fundrop/mint?address=${address}&referrer=${referrer}`)
      .then(({ data }: { data: { signature: string } }) => data.signature);

    if (result) {
      await redis.set(cacheKey, JSON.stringify(result), "EX", 300);
    }
  }

  return result;
};
