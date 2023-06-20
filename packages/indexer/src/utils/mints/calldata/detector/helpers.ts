import { Interface } from "@ethersproject/abi";
import { BigNumber } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";

import { baseProvider } from "@/common/provider";

export const getMaxSupply = async (contract: string): Promise<string | undefined> => {
  let maxSupply: string | undefined;
  try {
    const c = new Contract(
      contract,
      new Interface([
        "function maxSupply() view returns (uint256)",
        "function MAX_SUPPLY() view returns (uint256)",
      ]),
      baseProvider
    );

    if (!maxSupply) {
      maxSupply = await c
        .maxSupply()
        .then((t: BigNumber) => t.toString())
        .catch(() => undefined);
    }
    if (!maxSupply) {
      maxSupply = await c
        .MAX_SUPPLY()
        .then((t: BigNumber) => t.toString())
        .catch(() => undefined);
    }
  } catch {
    // Skip errors
  }

  return maxSupply;
};
