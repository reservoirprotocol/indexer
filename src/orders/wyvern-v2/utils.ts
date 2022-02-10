import * as Sdk from "@reservoir0x/sdk";

import { config } from "@/config/index";

export const getOrderTarget = (
  order: Sdk.WyvernV2.Order
): string | undefined => {
  try {
    if (order.params.kind?.endsWith("single-token-v2")) {
      if (order.params.kind?.startsWith("erc721")) {
        const { contract } = new Sdk.WyvernV2.Builders.Erc721.SingleToken.V2(
          config.chainId
        ).getDetails(order)!;

        return contract;
      } else if (order.params.kind?.startsWith("erc1155")) {
        const { contract } = new Sdk.WyvernV2.Builders.Erc1155.SingleToken.V2(
          config.chainId
        ).getDetails(order)!;

        return contract;
      }
    } else {
      return order.params.target;
    }
  } catch {
    return undefined;
  }
};
