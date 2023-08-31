/* eslint-disable @typescript-eslint/no-explicit-any */

import { logger } from "@/common/logger";
import { getStakedAmountWei, stakedAmountWeiToAttributeBucket } from "../apecoin";

const POOL_ID = 1;

export const extend = async (_chainId: number, metadata: any) => {
  const traitCount = metadata.attributes.length;

  let stakedAmountWei;
  try {
    const { tokenId } = metadata;
    stakedAmountWei = await getStakedAmountWei({ poolId: POOL_ID, tokenId });
  } catch (error) {
    // console.log(error);
    logger.error(
      "apecoin-extend",
      `Failed to get staked amount for tokenId ${metadata.tokenId}, poolId ${POOL_ID}, error: ${error}`
    );
    throw new Error(
      `Failed to get staked amount for tokenId ${metadata.tokenId}, poolId ${POOL_ID}, error: ${error}`
    );
  }

  if (!stakedAmountWei) {
    logger.error(
      "apecoin-extend",
      `Failed to get staked amount for tokenId ${metadata.tokenId}, poolId ${POOL_ID}`
    );
    throw new Error(
      `Failed to get staked amount for tokenId ${metadata.tokenId}, poolId ${POOL_ID}`
    );
  }

  return {
    ...metadata,
    attributes: [
      ...metadata.attributes,
      {
        key: "Trait Count",
        value: traitCount,
        kind: "string",
      },
      {
        key: "ApeCoin Staked",
        value: stakedAmountWeiToAttributeBucket({ stakedAmountWei }),
        kind: "string",
      },
    ],
  };
};
