import { Interface } from "@ethersproject/abi";
import { Contract } from "@ethersproject/contracts";
import * as Sdk from "@reservoir0x/sdk";
import { HashZero } from "@ethersproject/constants";

import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { config } from "@/config/index";
import { Transaction } from "@/models/transactions";
import { getStatus } from "@/orderbook/mints/calldata/helpers";
import {
  CollectionMint,
  getCollectionMints,
  simulateAndUpsertCollectionMint,
} from "@/orderbook/mints";

const STANDARD = "nfts2me";

export const extractByCollectionERC721 = async (collection: string): Promise<CollectionMint[]> => {
  const results: CollectionMint[] = [];

  const contract = new Contract(
    collection,
    new Interface([
      "function mintPrice() view returns (uint256)",
      "function totalSupply() view returns (uint256)",
      "function maxPerAddress() view returns (uint256)",
      "function n2mVersion() view returns (uint256)",
      "function mintFee(uint256 amount) view returns (uint256)",
      "function protocolFee() view returns (uint256)",
      "function merkleRoot() view returns (bytes32)",
    ]),
    baseProvider
  );

  try {
    const version = await contract.n2mVersion();
    if (!version) return [];

    const n2mVersion = version.toString();

    let price: string;
    if (parseInt(n2mVersion) > 1999) {
      const [mintFee, protocolFee, merkleRoot] = await Promise.all([
        contract.mintFee(1),
        contract.protocolFee(),
        contract.merkleRoot(),
      ]);
      price = protocolFee.add(mintFee).toString();

      if (merkleRoot != HashZero) {
        // allowlist mint
        return [];
      }
    } else {
      const [totalPrice] = await Promise.all([contract.mintPrice()]);

      price = totalPrice.toString();
    }

    const maxPerAddress = await contract.maxPerAddress();
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
            // "mintTo"
            signature: "0x449a52f8",
            params: [
              {
                kind: "recipient",
                abiType: "address",
              },
              {
                kind: "quantity",
                abiType: "uint256",
              },
              //   {
              //     kind: "referrer",
              //     abiType: "address",
              //   },
            ],
          },
        },
      },
      currency: Sdk.Common.Addresses.Native[config.chainId],
      price,
      maxMintsPerWallet: maxPerAddress.toString() === "0" ? undefined : maxPerAddress.toString(),
    });
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
      "0x449a52f8", // mintTo
      "0x438b1b4b", // mintTo
      "0x4a50aa85", // mintSpecifyTo
      "0x4402d254", // mintSpecifyTo
      "0xfefa5d72", // mintRandomTo
      "0x1d7df191", // mintRandomTo
      "0x9d13a5ba", // mintPresale
      "0x6ad54240", // mintCustomURITo
      "0xa0712d68", // mint
      "0x94bf804d", // mint
      "0x1249c58b", // mint
    ].some((bytes4) => tx.data.startsWith(bytes4))
  ) {
    return extractByCollectionERC721(collection);
  }

  return [];
};

export const refreshByCollection = async (collection: string) => {
  const existingCollectionMints = await getCollectionMints(collection, {
    standard: STANDARD,
  });

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
