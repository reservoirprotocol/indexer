import { Common } from "@reservoir0x/sdk";

import { baseProvider } from "@/common/provider";
import { redis } from "@/common/redis";
import * as ftApprovalsModel from "@/models/ft-approvals";

export const fetchAndUpdateFtApproval = async (
  token: string,
  owner: string,
  spender: string,
  useCaching?: boolean
): Promise<ftApprovalsModel.FtApproval> => {
  if (useCaching) {
    const cacheKey = `ft-approval-${token}-${owner}-${spender}`;

    // If the allowance is in the cache, then return it directly
    const allowance = await redis.get(cacheKey);
    if (allowance) {
      return {
        token,
        owner,
        spender,
        value: allowance,
      };
    } else {
      // Otherwise, fetch it from on-chain and update the cache
      const ftApproval = await fetchAndUpdateFtApproval(token, owner, spender);
      await redis.set(cacheKey, ftApproval.value, "EX", 5 * 60);

      return ftApproval;
    }
  } else {
    const erc20 = new Common.Helpers.Erc20(baseProvider, token);
    const allowance = await erc20.getAllowance(owner, spender).then((b) => b.toString());

    return ftApprovalsModel.saveFtApproval({
      token,
      owner,
      spender,
      value: allowance,
    });
  }
};
