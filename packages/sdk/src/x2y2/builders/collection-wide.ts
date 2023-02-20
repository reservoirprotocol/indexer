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
    // At the moment, X2Y2 only supports ERC721 tokens
    delegateType: Types.DelegationType.ERC721,
    deadline: params.deadline,
    currency: params.currency,
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
        data: defaultAbiCoder.encode(
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
