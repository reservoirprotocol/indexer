import { Interface } from "@ethersproject/abi";
import { BigNumber } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import * as Sdk from "@reservoir0x/sdk";

import { baseProvider } from "@/common/provider";
import { now } from "@/common/utils";
import { config } from "@/config/index";
import { Transaction } from "@/models/transactions";
import {
  CollectionMint,
  getCollectionMints,
  simulateAndUpsertCollectionMint,
} from "@/orderbook/mints";

const STANDARD = "titlesxyz";

/*
  Network: ZORA

  Factory: 0xAb359D0Eac42f94fd512f0a98D16Bf60D512CE72
  event EditionPublished(
      address indexed creator,
      address remixContractAddress,
      address creatorProceedRecipient,
      address derivativeFeeRecipient
  );

  EditionsV1:
  function purchase(uint256 quantity) external payable;

  Non editable:
  function price() external view (uint256)
  function maxSupply() external view (uint256)
  function mintLimitPerWallet() external view (uint256)
  function saleEndTime() external view (uint256)
*/

export const extractByCollectionERC721 = async (collection: string): Promise<CollectionMint[]> => {
  const results: CollectionMint[] = [];

  const contract = new Contract(
    collection,
    new Interface([
      "function price() external view returns (uint256)",
      "function maxSupply() external view returns (uint256)",
      "function mintLimitPerWallet() external view returns (uint256)",
      "function saleEndTime() external view returns (uint256)",
      "function DERIVATIVE_FEE() external view returns (uint256)",
    ]),
    baseProvider
  );

  const [price, maxSupply, mintLimitPerWallet, endTime, derivativeFee]: [
    BigNumber,
    string,
    string,
    number,
    BigNumber
  ] = await Promise.all([
    contract.price(),
    contract.maxSupply().then((res: BigNumber) => res.toString()),
    contract.mintLimitPerWallet().then((res: BigNumber) => res.toString()),
    contract.saleEndTime().then((res: BigNumber) => res.toNumber()),
    contract.DERIVATIVE_FEE(),
  ]);

  const endPrice = price.add(derivativeFee).toString();

  const isOpen = endTime < now();

  results.push({
    collection,
    contract: collection,
    stage: `public-sale-${collection}`,
    kind: "public",
    status: isOpen ? "open" : "closed",
    standard: STANDARD,
    details: {
      tx: {
        to: collection,
        data: {
          // "purchase"
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
    currency: Sdk.Common.Addresses.Native[config.chainId],
    price: endPrice,
    maxSupply: maxSupply === "0" ? undefined : maxSupply,
    maxMintsPerWallet: mintLimitPerWallet === "0" ? undefined : mintLimitPerWallet,
    endTime: endTime === 0 ? undefined : endTime,
  });

  return results;
};

export const extractByTx = async (
  collection: string,
  tx: Transaction
): Promise<CollectionMint[]> => {
  const iface = new Interface(["function purchase(uint256 quantity) external payable"]);

  const result = iface.parseTransaction({ data: tx.data });
  if (result) {
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
