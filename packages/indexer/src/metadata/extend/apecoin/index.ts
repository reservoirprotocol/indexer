/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  APE_COIN_STAKING_ABI,
  NFT_ABI,
  APE_COIN_STAKING_MAINNET,
  APE_COIN_NFT_CONTRACTS,
} from "./constants";
import { Multicall } from "ethereum-multicall";
import { ethers } from "ethers";

const REFERENCES = [
  "getApeCoinStakeCall",
  "getBaycStakesCall",
  "getMaycStakesCall",
  "getBakcStakesCall",
];

const METHOD_NAMES = ["getApeCoinStake", "getBaycStakes", "getMaycStakes", "getBakcStakes"];

const ONE_APECOIN_IN_WEI = BigInt(10 ** 18);

const provider = new ethers.providers.JsonRpcProvider(
  "https://mainnet.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161"
);

const multicall = new Multicall({ ethersProvider: provider, tryAggregate: true });

interface Params {
  poolId: number;
  tokenId: string;
}

export const getOwnerOf = async ({ poolId, tokenId }: Params) => {
  const ownerResult = await multicall.call([
    {
      reference: "NFTContract",
      contractAddress: APE_COIN_NFT_CONTRACTS[poolId],
      abi: NFT_ABI,
      calls: [
        {
          reference: "ownerOfCall",
          methodName: "ownerOf",
          methodParameters: [tokenId],
        },
      ],
    },
  ]);
  return ownerResult?.results?.NFTContract?.callsReturnContext[0]?.returnValues[0];
};

export const getStakedAmountWei = async ({ poolId, tokenId }: Params) => {
  const ownerOf = await getOwnerOf({ poolId, tokenId });

  const stakingResult = await multicall.call([
    {
      reference: "ApeCoinStaking",
      contractAddress: APE_COIN_STAKING_MAINNET,
      abi: APE_COIN_STAKING_ABI,
      calls: [
        {
          reference: REFERENCES[poolId],
          methodName: METHOD_NAMES[poolId],
          methodParameters: [ownerOf],
        },
        {
          reference: "getPoolsUICall",
          methodName: "getPoolsUI",
          methodParameters: [],
        },
      ],
    },
  ]);

  const returnedStakes =
    stakingResult?.results?.ApeCoinStaking?.callsReturnContext[0]?.returnValues;

  const tokenIdHex = ethers.utils.hexlify(Number(tokenId));
  const stakeStruct = returnedStakes.find((stake) => stake[1]?.hex === tokenIdHex);
  return Number(stakeStruct[2]?.hex);
};

export const stakedAmountWeiToAttributeBucket = ({
  stakedAmountWei,
}: {
  stakedAmountWei: number;
}) => {
  if (!stakedAmountWei || stakedAmountWei < ONE_APECOIN_IN_WEI) {
    return "0 - 1 ApeCoin";
  }
  if (stakedAmountWei < BigInt(10) * ONE_APECOIN_IN_WEI) {
    return "1 - 10 ApeCoin";
  }
  if (stakedAmountWei < BigInt(100) * ONE_APECOIN_IN_WEI) {
    return "10 - 100 ApeCoin";
  }
  if (stakedAmountWei < BigInt(1000) * ONE_APECOIN_IN_WEI) {
    return "100 - 1000 ApeCoin";
  }
  return "1000+ ApeCoin";
};
