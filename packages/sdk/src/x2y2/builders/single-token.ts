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
    // At the moment, X2Y2 only supports ERC721 tokens
    delegateType: Types.DelegationType.ERC721,
    deadline: params.deadline,
    currency: params.currency,
    dataMask: "0x",
    items: [
      {
        price: params.price.toString(),
        data: defaultAbiCoder.encode(
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
