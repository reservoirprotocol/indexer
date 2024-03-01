import { Interface } from "@ethersproject/abi";
import { BigNumber } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import * as Sdk from "@reservoir0x/sdk";

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
import { getStatus, toSafeNumber, toSafeTimestamp } from "@/orderbook/mints/calldata/helpers";

const STANDARD = "highlightxyz";

export interface Info {
  vectorId: string;
  prices?: string[];
  pricePeriodDuration?: number;
  lowestPriceIndex?: number;
  platformFee?: string;
}

interface MechanicVectorMetadata {
  contractAddress: string;
  editionId: number;
  mechanic: string;
  isEditionBased: boolean;
  isChoose: boolean;
  paused: boolean;
}

interface AbridgedVector {
  contractAddress: string;
  startTimestamp: number;
  endTimestamp: number;
  paymentRecipient: string;
  maxTotalClaimableViaVector: number;
  totalClaimedViaVector: number;
  currency: string;
  tokenLimitPerTx: number;
  maxUserClaimableViaVector: number;
  pricePerToken: BigNumber;
  editionId: number;
  editionBasedCollection: boolean;
  requireDirectEOA: boolean;
  allowlistRoot: string;
}

interface DAMechanicRawVector {
  startTimestamp: number;
  endTimestamp: number;
  periodDuration: number;
  maxUserClaimableViaVector: number;
  maxTotalClaimableViaVector: number;
  currentSupply: number;
  lowestPriceSoldAtIndex: number;
  tokenLimitPerTx: number;
  numPrices: number;
  paymentRecipient: string;
  totalSales: BigNumber;
  bytesPerPrice: number;
  auctionExhausted: boolean;
  payeeRevenueHasBeenWithdrawn: boolean;
}

interface DAMechanicState {
  rawVector: DAMechanicRawVector;
  prices: BigNumber[];
  currentPrice: BigNumber;
  payeePotentialEscrowedFunds: BigNumber;
  collectionSupply: BigNumber;
  collectionSize: BigNumber;
  escrowedFundsAmountFinalized: boolean;
  auctionExhausted: boolean;
  auctionInFPP: boolean;
}

export const mintManagerInterface = new Interface([
  `function getAbridgedVector(uint256) view returns (
    address contractAddress,
    uint48 startTimestamp,
    uint48 endTimestamp,
    address paymentRecipient,
    uint48 maxTotalClaimableViaVector,
    uint48 totalClaimedViaVector,
    address currency,
    uint48 tokenLimitPerTx,
    uint48 maxUserClaimableViaVector,
    uint192 pricePerToken,
    uint48 editionId,
    bool editionBasedCollection,
    bool requireDirectEOA,
    bytes32 allowlistRoot
  )`,
  `function mechanicVectorMetadata(bytes32) view returns (
    address contractAddress,
    uint96 editionId,
    address mechanic,
    bool isEditionBased,
    bool isChoose,
    bool paused
  )`,
  `function mechanicMintNum(
    bytes32 vectorId,
    address recipient,
    uint32 numToMint,
    bytes data
  )`,
  `function vectorMint721(
    uint256 vectorId,
    uint48 numTokensToMint,
    address mintRecipient
  )`,
]);

export const extractByCollectionERC721 = async (
  collection: string,
  info: Info
): Promise<CollectionMint[]> => {
  const results: CollectionMint[] = [];

  const { vectorId } = info;

  const mintManagerAddress = Sdk.HighlightXyz.Addresses.MintManager[config.chainId];
  const mintManager = new Contract(mintManagerAddress, mintManagerInterface, baseProvider);

  // First we need to find the vector configuration: "AbridgedVector" or "MechanicVector"
  // - "AbridgedVector": the minter will mint directly on the collection and all the configuration of the mint is in that vector
  // - "MechanicVector": the minter will call another contract which will process the data, similar to the "Strategy" pattern
  // that allows DA and other strategies to be added latter to the main minter contract
  try {
    // "AbridgedVector" ids are integers, "MechanicVector" ids are bytes32 - we can detect which one it is by checking if `vectorId` starts with 0x
    if (!String(vectorId).startsWith("0x")) {
      const vector: AbridgedVector = await mintManager.getAbridgedVector(vectorId);

      // The vector is not for that collection
      if (vector.contractAddress.toLowerCase() != collection) {
        return [];
      }

      const startTimestamp = toSafeTimestamp(vector.startTimestamp);
      const endTimestamp = toSafeTimestamp(vector.endTimestamp);
      const totalClaimedViaVector = vector.totalClaimedViaVector;
      const maxTotalClaimableViaVector = toSafeNumber(vector.maxTotalClaimableViaVector);
      const maxUserClaimableViaVector = toSafeNumber(vector.maxUserClaimableViaVector);
      const currency = vector.currency.toLowerCase();
      let price = vector.pricePerToken.toString();
      const tokenLimitPerTx = toSafeNumber(vector.tokenLimitPerTx);

      if (currency !== Sdk.Common.Addresses.Native[config.chainId]) {
        return [];
      }

      // Include the platform fee into the price (not available via a public method se we have to read the storage slot directly)
      const platformFee = await baseProvider
        .getStorageAt(mintManager.address, 166)
        .then((value) => bn(value));
      price = bn(price).add(platformFee).toString();

      const isOpen = maxTotalClaimableViaVector
        ? bn(maxTotalClaimableViaVector).lte(totalClaimedViaVector)
        : true;

      const item: CollectionMint = {
        collection,
        contract: collection,
        stage: `public-highlight-${vectorId}`,
        kind: "public",
        status: isOpen ? "open" : "closed",
        standard: STANDARD,
        details: {
          tx: {
            to: mintManager.address,
            data: {
              signature: mintManager.interface.getSighash("vectorMint721"),
              params: [
                {
                  kind: "unknown",
                  abiType: "uint256",
                  abiValue: vectorId.toString(),
                },
                {
                  kind: "quantity",
                  abiType: "uint48",
                },
                {
                  kind: "recipient",
                  abiType: "address",
                },
              ],
            },
          },
          info: {
            vectorId,
          },
        },
        maxSupply: maxTotalClaimableViaVector,
        maxMintsPerWallet: maxUserClaimableViaVector,
        maxMintsPerTransaction: tokenLimitPerTx,
        startTime: startTimestamp,
        endTime: endTimestamp,
        currency,
        price,
      };

      results.push(item);
    } else {
      // "Mechanics" are equivalent to the "Strategy" pattern
      const vector: MechanicVectorMetadata = await mintManager.mechanicVectorMetadata(vectorId);
      await tryDetectDutchAuction(results, mintManager, collection, vectorId, vector);
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const tryDetectDutchAuction = async (
  results: CollectionMint[],
  mintManager: Contract,
  collection: string,
  vectorId: string,
  vector: MechanicVectorMetadata
): Promise<void> => {
  // For the moment we only support one strategy: "DiscreteDutchAuctionMechanic"
  const daAddress = Sdk.HighlightXyz.Addresses.DiscreteDutchAuctionMechanic[config.chainId];
  if (!daAddress) {
    return;
  }

  // If it's not the DA we know of, skip processing
  if (vector.mechanic.toLocaleLowerCase() !== daAddress) {
    return;
  }

  const daContract = new Contract(
    daAddress,
    new Interface([
      `function getVectorState(
        bytes32 mechanicVectorId
      ) view returns (
        (
          uint48 startTimestamp,
          uint48 endTimestamp,
          uint32 periodDuration,
          uint32 maxUserClaimableViaVector,
          uint48 maxTotalClaimableViaVector,
          uint48 currentSupply,
          uint32 lowestPriceSoldAtIndex,
          uint32 tokenLimitPerTx,
          uint32 numPrices,
          address paymentRecipient,
          uint240 totalSales,
          uint8 bytesPerPrice,
          bool auctionExhausted,
          bool payeeRevenueHasBeenWithdrawn
        ) rawVector,
        uint200[] prices,
        uint200 currentPrice,
        uint256 payeePotentialEscrowedFunds,
        uint256 collectionSupply,
        uint256 collectionSize,
        bool escrowedFundsAmountFinalized,
        bool auctionExhausted,
        bool auctionInFPP
      )`,
    ]),
    baseProvider
  );

  const daState: DAMechanicState = await daContract.getVectorState(vectorId);
  const rawVector = daState.rawVector;

  // "rawVector" data
  const startTimestamp = toSafeTimestamp(rawVector.startTimestamp);
  const endTimestamp = toSafeTimestamp(rawVector.endTimestamp);
  const currentSupply = rawVector.currentSupply;
  const maxUserClaimableViaVector = toSafeNumber(rawVector.maxUserClaimableViaVector);
  const tokenLimitPerTx = toSafeNumber(rawVector.tokenLimitPerTx);

  // Get the platform fee (not available via a public method se we have to read the storage slot directly)
  const platformFee = await baseProvider
    .getStorageAt(mintManager.address, 166)
    .then((value) => bn(value));

  // "mechanicVector" data
  const price = daState.currentPrice.toString();
  const maxSupply = toSafeNumber(daState.collectionSize);

  const currency = Sdk.Common.Addresses.Native[config.chainId];
  const isOpen = currentSupply > 0;

  const item: CollectionMint = {
    collection,
    contract: collection,
    stage: `public-highlight-${vectorId}`,
    kind: "public",
    status: isOpen ? "open" : "closed",
    standard: STANDARD,
    details: {
      tx: {
        to: mintManager.address,
        data: {
          signature: mintManager.interface.getSighash("mechanicMintNum"),
          params: [
            {
              kind: "unknown",
              abiType: "bytes32",
              abiValue: vectorId,
            },
            {
              kind: "recipient",
              abiType: "address",
            },
            {
              kind: "quantity",
              abiType: "uint48",
            },
            {
              kind: "unknown",
              abiType: "bytes",
              abiValue: [],
            },
          ],
        },
      },
      info: {
        vectorId,
        // For calculating the price without the need to make an on-chain call
        prices: daState.prices.map((price) => price.toString()),
        pricePeriodDuration: rawVector.periodDuration,
        lowestPriceIndex: rawVector.lowestPriceSoldAtIndex,
        platformFee: platformFee.toString(),
      },
    },
    maxSupply,
    maxMintsPerWallet: maxUserClaimableViaVector,
    startTime: startTimestamp,
    endTime: endTimestamp,
    currency,
    price,
    maxMintsPerTransaction: tokenLimitPerTx,
  };

  results.push(item);
};

export const refreshByCollection = async (collection: string) => {
  const existingCollectionMints = await getCollectionMints(collection, { standard: STANDARD });

  let latestCollectionMints: CollectionMint[] = [];
  for (const { details } of existingCollectionMints) {
    // Fetch the currently available mints
    latestCollectionMints = latestCollectionMints.concat(
      await extractByCollectionERC721(collection, details.info! as Info)
    );
  }

  // Simulate the ones still available
  for (const collectionMint of latestCollectionMints) {
    await simulateAndUpsertCollectionMint(collectionMint);
  }

  // Assume anything that exists in our system but was not returned
  // in the above call is not available anymore so we can close
  for (const existing of existingCollectionMints) {
    const stillExists = latestCollectionMints.find((latest) => {
      return (
        latest.collection == existing.collection &&
        latest.stage == existing.stage &&
        latest.kind == existing.kind
      );
    });
    if (!stillExists) {
      await simulateAndUpsertCollectionMint({
        ...existing,
        status: "closed",
      });
    }
  }
};

export const extractByTx = async (
  collection: string,
  tx: Transaction
): Promise<CollectionMint[]> => {
  const signatures = [
    mintManagerInterface.getSighash("mechanicMintNum"),
    mintManagerInterface.getSighash("vectorMint721"),
  ];

  if (signatures.includes(tx.data.substring(0, 10))) {
    const result = mintManagerInterface.parseTransaction({ data: tx.data });
    if (result) {
      return extractByCollectionERC721(collection, { vectorId: result.args.vectorId.toString() });
    }
  }

  return [];
};

export const getPrice = async (mint: CollectionMint) => {
  const info = mint.details.info as Info;

  const latestBlock = await baseProvider.getBlockNumber();
  const timestamp = await baseProvider.getBlock(latestBlock - 1).then((b) => b.timestamp);

  const hypotheticalIndex = Math.ceil((timestamp - mint.startTime!) / info.pricePeriodDuration!);

  const priceList = info.prices ?? [];
  const priceIndex =
    hypotheticalIndex >= priceList.length ? priceList.length - 1 : hypotheticalIndex;
  const dutchPrice = priceList[priceIndex];

  return bn(dutchPrice).add(bn(info.platformFee!)).toString();
};
