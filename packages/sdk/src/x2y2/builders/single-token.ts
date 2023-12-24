import { defaultAbiCoder } from "@ethersproject/abi";
import { BigNumberish } from "@ethersproject/bignumber";

import { BaseBuildParams } from "./base";
import * as Types from "../types";
import { getRandomBytes } from "../../utils";

interface BuildParams extends BaseBuildParams {
  tokenId: BigNumberish;
}

export const buildOrder = (params: BuildParams): Types.LocalOrder => {
  return {
    salt: params.salt?.toString() ?? getRandomBytes(32).toHexString(),
    user: params.user,
    network: params.network,
    intent: params.side === "sell" ? Types.Intent.SELL : Types.Intent.BUY,
    delegateType: params.delegateType ?? Types.DelegationType.ERC721,
    deadline: params.deadline,
    currency: params.currency,
    taker: params.taker,
    amount: Number(params.amount ?? 1),
    dataMask: "0x",
    items: [
      {
        price: params.price.toString(),
        data:
          params.delegateType === Types.DelegationType.ERC1155
            ? defaultAbiCoder.encode(
                ["(address token, uint256 tokenId, uint256 amount)[]"],
                [
                  [
                    {
                      token: params.contract,
                      tokenId: params.tokenId,
                      amount: params.amount ?? 1,
                    },
                  ],
                ]
              )
            : defaultAbiCoder.encode(
                ["(address token, uint256 tokenId)[]"],
                [
                  [
                    {
                      token: params.contract,
                      tokenId: params.tokenId,
                    },
                  ],
                ]
              ),
      },
    ],
    signVersion: 1,
  };
};
