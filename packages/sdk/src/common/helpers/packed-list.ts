import { defaultAbiCoder } from "@ethersproject/abi";
import { BigNumberish } from "@ethersproject/bignumber";

import { bn } from "../../utils";

export const getPackedListCalldataSize = (tokenIds: BigNumberish[]) => {
  let maxTokenId = tokenIds[tokenIds.length - 1];
  let numBytes = 0;
  while (bn(maxTokenId).gt(0)) {
    maxTokenId = bn(maxTokenId).shr(8);
    numBytes++;
  }
  numBytes = Math.max(numBytes, 1);

  return 96 + numBytes * tokenIds.length;
};

export const generatePackedList = (tokenIds: BigNumberish[]) => {
  tokenIds.sort((a, b) => (bn(a).lt(b) ? -1 : 1));

  let maxTokenId = tokenIds[tokenIds.length - 1];
  let numBytes = 0;
  while (bn(maxTokenId).gt(0)) {
    maxTokenId = bn(maxTokenId).shr(8);
    numBytes++;
  }
  numBytes = Math.max(numBytes, 1);

  return defaultAbiCoder.encode(
    ["uint256", "bytes"],
    [
      numBytes,
      "0x" +
        tokenIds
          .map((x) =>
            bn(x)
              .toHexString()
              .slice(2)
              .padStart(numBytes * 2, "0")
          )
          .join(""),
    ]
  );
};

export const decomposePackedList = (packedList: string) => {
  let [numBytes, list] = defaultAbiCoder.decode(
    ["uint256", "bytes"],
    packedList
  );
  numBytes = Number(numBytes);

  const result: BigNumberish[] = [];
  for (let i = 2; i < list.length; i += numBytes * 2) {
    result.push(bn("0x" + list.slice(i, i + numBytes * 2)));
  }
  return result;
};
