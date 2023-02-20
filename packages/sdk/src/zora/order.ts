import * as Types from "./types";
import { lc, n, s } from "../utils";

export class Order {
  public chainId: number;
  public params: Types.OrderParams;

  constructor(chainId: number, params: Types.OrderParams) {
    this.chainId = chainId;

    try {
      this.params = normalize(params);
    } catch {
      throw new Error("Invalid params");
    }
  }
}

const normalize = (order: Types.OrderParams): Types.OrderParams => {
  // Perform some normalization operations on the order:
  // - convert bignumbers to strings where needed
  // - convert strings to numbers where needed
  // - lowercase all strings

  return {
    // https://github.com/ourzora/v3/blob/main/contracts/modules/Asks/V1.1/AsksV1_1.sol#L117-L131
    askCurrency: lc(order.askCurrency), // address
    askPrice: s(order.askPrice), // uint256
    findersFeeBps: n(order.findersFeeBps), // uint16
    sellerFundsRecipient: lc(order.sellerFundsRecipient), // address
    tokenContract: lc(order.tokenContract), // address
    tokenId: s(order.tokenId), // uint256
  };
};
