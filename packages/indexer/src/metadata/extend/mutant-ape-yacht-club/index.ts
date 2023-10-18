/* eslint-disable @typescript-eslint/no-explicit-any */

import { logger } from "@/common/logger";
import { getStakedAmountWei, stakedAmountWeiToAttributeBucket } from "../apecoin";
import { TokenMetadata } from "@/metadata/types";

const POOL_ID = 2;

export const extend = async (metadata: TokenMetadata) => {
  const traitCount = metadata.attributes.length;
  let serumType;
  let name;

  // M3 apes have no other attributes besides `Name`
  if (metadata.attributes.length === 1) {
    serumType = "Mega";
    name = metadata.attributes[0].value;
  } else if (metadata.attributes[0]?.value && typeof metadata.attributes[0].value === "string") {
    serumType = metadata.attributes[0].value.slice(0, 2);
    name = `#${metadata.tokenId} (${serumType})`;
  }

  let stakedAmountWei;
  try {
    const { tokenId } = metadata;
    stakedAmountWei = await getStakedAmountWei({ poolId: POOL_ID, tokenId: tokenId.toString() });
  } catch (error) {
    logger.error(
      "mayc-extend",
      `Failed to get staked amount for tokenId ${metadata.tokenId}, poolId ${POOL_ID}, error: ${error}`
    );
    throw new Error(
      `Failed to get staked amount for tokenId ${metadata.tokenId}, poolId ${POOL_ID}, error: ${error}`
    );
  }

  if (stakedAmountWei === undefined) {
    logger.error(
      "mayc-extend",
      `Failed to get staked amount for tokenId ${metadata.tokenId}, poolId ${POOL_ID}`
    );
    throw new Error(
      `Failed to get staked amount for tokenId ${metadata.tokenId}, poolId ${POOL_ID}`
    );
  }
  return {
    ...metadata,
    name,
    attributes: [
      ...metadata.attributes,
      {
        key: "Serum Type",
        value: serumType,
        kind: "string",
        rank: 2,
      },
      {
        key: "ApeCoin Staked",
        value: stakedAmountWeiToAttributeBucket({ stakedAmountWei }),
        kind: "string",
      },
      {
        key: "Trait Count",
        value: traitCount,
        kind: "string",
      },
    ],
  };
};
