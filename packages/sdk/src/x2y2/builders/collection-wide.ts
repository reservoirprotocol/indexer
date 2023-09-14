import { defaultAbiCoder } from "@ethersproject/abi";
import { AddressZero } from "@ethersproject/constants";

import { BaseBuildParams } from "./base";
import * as Types from "../types";
import { getRandomBytes } from "../../utils";

interface BuildParams extends BaseBuildParams {}

export const buildOrder = (params: BuildParams): Types.LocalOrder => {
  if (params.side !== "buy") {
    throw new Error("Unsupported side");
  }

  return {
    salt: params.salt?.toString() ?? getRandomBytes(32).toHexString(),
    user: params.user,
    network: params.network,
    intent: Types.Intent.BUY,
    delegateType: params.delegateType ?? Types.DelegationType.ERC721,
    deadline: params.deadline,
    currency: params.currency,
    amount: Number(params.amount ?? 1),
    dataMask: defaultAbiCoder.encode(
      ["(address token, uint256 tokenId)[]"],
      [
        [
          {
            token: AddressZero,
            tokenId: "0x" + "1".repeat(64),
          },
        ],
      ]
    ),
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
                      tokenId: 0,
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
                      tokenId: 0,
                    },
                  ],
                ]
              ),
      },
    ],
    signVersion: 1,
  };
};
