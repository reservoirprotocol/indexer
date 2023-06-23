import { Interface } from "@ethersproject/abi";
import { BigNumber } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import * as Sdk from "@reservoir0x/sdk";
import axios from "axios";

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
import { AllowlistItem, createAllowlist } from "@/orderbook/mints/allowlists";
import { getStatus, toSafeTime } from "@/orderbook/mints/calldata/helpers";

export type Info = {
  merkleRoot?: string;
};

export const extractByCollection = async (collection: string): Promise<CollectionMint[]> => {
  const c = new Contract(
    collection,
    new Interface([
      `
        function saleDetails() view returns (
          (
            bool publicSaleActive,
            bool presaleActive,
            uint256 publicSalePrice,
            uint64 publicSaleStart,
            uint64 publicSaleEnd,
            uint64 presaleStart,
            uint64 presaleEnd,
            bytes32 presaleMerkleRoot,
            uint256 maxSalePurchasePerAddress,
            uint256 totalMinted,
            uint256 maxSupply
          )
        )
      `,
      "function zoraFeeForAmount(uint256 quantity) view returns (address recipient, uint256 fee)",
    ]),
    baseProvider
  );

  const results: CollectionMint[] = [];
  try {
    const saleDetails = await c.saleDetails();
    const fee = await c.zoraFeeForAmount(1).then((f: { fee: BigNumber }) => f.fee);

    // Public sale
    if (saleDetails.publicSaleActive) {
      // price = on-chain-price + fee
      const price = bn(saleDetails.publicSalePrice).add(fee).toString();

      results.push({
        collection,
        contract: collection,
        stage: "public-sale",
        kind: "public",
        status: "open",
        standard: "zora",
        details: {
          tx: {
            to: collection,
            data: {
              // `purchase`
              signature: "0xefef39a1",
              params: [
                {
                  kind: "quantity",
                  abiType: "uint256",
                },
              ],
            },
          },
        },
        currency: Sdk.Common.Addresses.Eth[config.chainId],
        price,
        maxMintsPerWallet: saleDetails.maxSalePurchasePerAddress.toString(),
        maxSupply: saleDetails.maxSupply.toString(),
        startTime: toSafeTime(saleDetails.publicSaleStart),
        endTime: toSafeTime(saleDetails.publicSaleEnd),
      });
    }

    // Presale
    if (saleDetails.presaleActive) {
      const merkleRoot = saleDetails.presaleMerkleRoot;
      const allowlistItems = await axios
        .get(`https://allowlist.zora.co/allowlist/${merkleRoot}`)
        .then(({ data }) => data)
        .then(async (data: { entries: { user: string; price: string; maxCanMint: number }[] }) => {
          return data.entries.map(
            (e) =>
              ({
                address: e.user,
                maxMints: String(e.maxCanMint),
                // price = on-chain-price
                price: e.price,
                // actualPrice = on-chain-price + fee
                actualPrice: bn(e.price).add(fee).toString(),
              } as AllowlistItem)
          );
        });

      await createAllowlist(merkleRoot, allowlistItems);

      results.push({
        collection,
        contract: collection,
        stage: "presale",
        kind: "allowlist",
        status: "open",
        standard: "zora",
        details: {
          tx: {
            to: collection,
            data: {
              // `purchasePresale`
              signature: "0x25024a2b",
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
          info: {
            merkleRoot,
          },
        },
        currency: Sdk.Common.Addresses.Eth[config.chainId],
        maxSupply: saleDetails.maxSupply.toString(),
        startTime: toSafeTime(saleDetails.presaleStart),
        endTime: toSafeTime(saleDetails.presaleEnd),
        allowlistId: merkleRoot,
      });
    }
  } catch (error) {
    logger.error("mint-detector", JSON.stringify({ kind: "zora", error }));
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
      "0xefef39a1", // `purchase`
      "0x03ee2733", // `purchaseWithComment`
      "0x25024a2b", // `purchasePresale`
      "0x2e706b5a", // `purchasePresaleWithComment`
    ].some((bytes4) => tx.data.startsWith(bytes4))
  ) {
    return extractByCollection(collection);
  }

  return [];
};

export const refreshByCollection = async (collection: string) => {
  const existingCollectionMints = await getCollectionMints(collection, { standard: "zora" });

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
};
