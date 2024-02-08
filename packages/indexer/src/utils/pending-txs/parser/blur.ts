import { Interface } from "@ethersproject/abi";

import { PendingToken } from "@/utils/pending-txs/types";

import BlendAbi from "@reservoir0x/sdk/dist/blend/abis/Blend.json";
import BlurAbi from "@reservoir0x/sdk/dist/blur/abis/Exchange.json";

export const parseTokensFromCalldata = async (calldata: string): Promise<PendingToken[]> => {
  const parsedTokens: PendingToken[] = [];
  try {
    // Blur

    const blurIface = new Interface(BlurAbi);

    let executions = [];
    try {
      const { name: funcName, args } = blurIface.parseTransaction({
        data: calldata,
      });
      if (["execute"].includes(funcName)) {
        executions = [args];
      } else if (["bulkExecute"].includes(funcName)) {
        executions = args.executions;
      }
    } catch {
      // Skip error
    }

    for (let i = 0; i < executions.length; i++) {
      try {
        const { sell, buy } = executions[i];

        const sellTokenId = sell.order.tokenId.toString();
        const buyTokenId = buy.order.tokenId.toString();
        const contract = buy.order.collection;

        parsedTokens.push({
          contract: contract,
          tokenId: sellTokenId || buyTokenId,
        });
      } catch {
        // Skip erros
      }
    }

    // Blend

    const blendIface = new Interface(BlendAbi);
    const { name: methodName, args } = blendIface.parseTransaction({
      data: calldata,
    });
    if (
      ["buyToBorrow", "buyToBorrowV2", "buyToBorrowETH", "buyToBorrowV2ETH"].includes(methodName)
    ) {
      const { offer, execution } = args;

      parsedTokens.push({
        contract: offer.collection.toLowerCase(),
        tokenId: execution.listing
          ? execution.listing.tokenId.toString()
          : execution.makerOrder.order.tokenId.toString(),
      });
    } else if (["buyLocked", "buyLockedETH"].includes(methodName)) {
      const { lien } = args;

      parsedTokens.push({
        contract: lien.collection.toLowerCase(),
        tokenId: lien.tokenId.toString(),
      });
    } else if (["borrow"].includes(methodName)) {
      const { offer, collateralTokenId } = args;

      parsedTokens.push({
        contract: offer.collection.toLowerCase(),
        tokenId: collateralTokenId.toString(),
      });
    } else if (["repay", "takeBid", "takeBidV2"].includes(methodName)) {
      const { lien } = args;

      parsedTokens.push({
        contract: lien.collection.toLowerCase(),
        tokenId: lien.tokenId.toString(),
      });
    }
  } catch {
    // Skip errors
  }

  return parsedTokens;
};
