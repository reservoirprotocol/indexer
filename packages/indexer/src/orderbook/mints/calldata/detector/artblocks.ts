import { Interface } from "@ethersproject/abi";
import { Contract } from "@ethersproject/contracts";
import { BigNumber } from "@ethersproject/bignumber";

import { logger } from "@/common/logger";
import { bn } from "@/common/utils";
import { baseProvider } from "@/common/provider";
import { Transaction } from "@/models/transactions";
import {
  CollectionMint,
  getCollectionMints,
  simulateAndUpsertCollectionMint,
} from "@/orderbook/mints";
import { getStatus, toSafeNumber } from "@/orderbook/mints/calldata/helpers";

const STANDARD = "artblocks";

const MINTER_TYPES = {
  SET_PRICE_V4: "MinterSetPriceV4",
  DA_EXP_SETTLEMENT_V1: "MinterDAExpSettlementV1",
};

export interface Info {
  projectId: number;
  tokenId?: number;
  daConfig?: DAConfigInfo;
}

export interface DAConfigInfo {
  timestampStart: number;
  priceDecayHalfLifeSeconds: number;
  startPrice: string;
  basePrice: string;
}
interface ProjectInfo {
  invocations: BigNumber;
  maxInvocations: BigNumber;
  active: boolean;
  paused: boolean;
  completedTimestamp: BigNumber;
  locked: boolean;
}

interface MinterTypePriceInfo {
  isConfigured: boolean;
  tokenPriceInWei: BigNumber;
  currencySymbol: string;
  currencyAddress: string;
}

// Mimick ArtBlocks `_getPrice()` method for DA projects
export const getPrice = async (daConfig: DAConfigInfo) => {
  const latestBlock = await baseProvider.getBlockNumber();
  const timestamp = await baseProvider.getBlock(latestBlock - 1).then((b) => b.timestamp);

  const elapsedTimeSeconds = timestamp - daConfig.timestampStart;

  let decayedPrice = bn(daConfig.startPrice).div(
    bn(2).pow(Math.floor(elapsedTimeSeconds / daConfig.priceDecayHalfLifeSeconds))
  );
  decayedPrice = decayedPrice.sub(
    decayedPrice
      .mul(elapsedTimeSeconds % daConfig.priceDecayHalfLifeSeconds)
      .div(daConfig.priceDecayHalfLifeSeconds)
      .div(2)
  );

  if (decayedPrice.lt(daConfig.basePrice)) {
    return daConfig.basePrice;
  }

  return decayedPrice.toString();
};

export const extractByCollectionERC721 = async (
  collection: string,
  info: Info
): Promise<CollectionMint[]> => {
  const results: CollectionMint[] = [];

  const { projectId, daConfig } = info;
  const collectionId = `${collection}:${projectId}000000:${projectId}999999`;

  // We will need information from the collection about the project id
  const projectHolder = new Contract(
    collection,
    new Interface([
      `function minterContract() view returns (address)`,
      `function projectStateData(uint256 _projectId) view returns (
          uint256 invocations,
          uint256 maxInvocations,
          bool active,
          bool paused,
          uint256 completedTimestamp,
          bool locked
      )
      `,
    ]),
    baseProvider
  );

  try {
    const projectInfo: ProjectInfo = await projectHolder.projectStateData(projectId);

    // We will also need information from `MinterFilter` about the project id
    const minterFilterAddress = await projectHolder.minterContract();
    const minterFilter = new Contract(
      minterFilterAddress,
      new Interface(["function getMinterForProject(uint256 _projectId) view returns (address)"]),
      baseProvider
    );

    let minterAddressForProject: string | undefined;
    try {
      // The call will revert if a project minter is not set
      minterAddressForProject = await minterFilter.getMinterForProject(projectId);
    } catch {
      // Skip errors
    }

    // We only proceed if there is a minter associated with project
    if (minterAddressForProject) {
      // Get information from the minter itself
      const minterTypeContract = new Contract(
        minterAddressForProject,
        new Interface([
          "function minterType() view returns (string memory)",
          `function getPriceInfo(uint256 _projectId) view returns (
            bool isConfigured,
            uint256 tokenPriceInWei,
            string currencySymbol,
            address currencyAddress
          )`,
        ]),
        baseProvider
      );

      const isOpen = projectInfo.active && !projectInfo.paused && !projectInfo.locked;

      const minterType = await minterTypeContract.minterType();
      if ([MINTER_TYPES.SET_PRICE_V4, MINTER_TYPES.DA_EXP_SETTLEMENT_V1].includes(minterType)) {
        const priceInfo: MinterTypePriceInfo = await minterTypeContract.getPriceInfo(projectId);
        if (priceInfo.isConfigured) {
          const result: CollectionMint = {
            collection: collectionId,
            contract: collection,
            stage: `public-sale-artblocks-${collection}-${projectId}`,
            kind: "public",
            status: isOpen ? "open" : "closed",
            standard: STANDARD,
            details: {
              tx: {
                to: minterAddressForProject,
                data: {
                  // "purchaseTo_do6"
                  signature: "0x00009987",
                  params: [
                    {
                      kind: "recipient",
                      abiType: "address",
                    },
                    {
                      kind: "unknown",
                      abiType: "uint256",
                      abiValue: projectId,
                    },
                  ],
                },
              },
              info: {
                hasDynamicPrice: minterType === MINTER_TYPES.DA_EXP_SETTLEMENT_V1,
                projectId,
              },
            },
            currency: priceInfo.currencyAddress,
            price: priceInfo.tokenPriceInWei.toString(),
            maxSupply: toSafeNumber(projectInfo.maxInvocations),
          };

          // Get additional information for DA mints
          if (minterType === MINTER_TYPES.DA_EXP_SETTLEMENT_V1) {
            if (daConfig) {
              (result.details.info! as Info).daConfig = daConfig;
            } else {
              const minterContract = new Contract(
                minterAddressForProject,
                new Interface([
                  `function projectAuctionParameters(uint256 _projectId) view returns (
                    uint256 timestampStart,
                    uint256 priceDecayHalfLifeSeconds,
                    uint256 startPrice,
                    uint256 basePrice
                  )`,
                ]),
                baseProvider
              );

              const daInfo = await minterContract.projectAuctionParameters(projectId);
              const startTime = daInfo.timestampStart.toNumber();

              // Enhance with `startTime` and `daConfig`
              result.startTime = startTime;
              (result.details.info! as Info).daConfig = {
                timestampStart: startTime,
                priceDecayHalfLifeSeconds: daInfo.priceDecayHalfLifeSeconds.toNumber(),
                startPrice: daInfo.startPrice.toString(),
                basePrice: daInfo.basePrice.toString(),
              };
            }
          }

          results.push(result);
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
  const iface = new Interface([
    "function purchase(uint256 projectId) returns (uint256 tokenId)",
    "function purchase_H4M(uint256 projectId) returns (uint256 tokenId)",
    "function purchaseTo(address _to, uint256 projectId) returns (uint256 tokenId)",
    "function purchaseTo_do6(address _to, uint256 projectId) returns (uint256 tokenId)",
  ]);

  const found = iface.fragments.find((fragment) => {
    return tx.data.startsWith(iface.getSighash(fragment));
  });

  if (found) {
    const result = iface.parseTransaction({ data: tx.data });
    if (result && result?.args.projectId) {
      const projectId: number = result.args.projectId.toNumber();
      return extractByCollectionERC721(collection, { projectId });
    }
  }

  return [];
};
