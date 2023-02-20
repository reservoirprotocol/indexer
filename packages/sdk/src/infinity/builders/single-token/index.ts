import { constants } from "ethers";
import { Addresses, Order, Types } from "../..";
import { BaseBuilder } from "../base";

export type SingleTokenOrderParams = Omit<
  Types.OrderInput,
  "complication" | "numItems" | "nfts" | "extraParams"
> & { collection: string; tokenId: string; numTokens: number };

export class SingleTokenBuilder extends BaseBuilder<SingleTokenOrderParams> {
  public isValid(order: Order): boolean {
    try {
      order.checkBaseValid();
      return order.kind === "single-token";
    } catch (err) {
      return false;
    }
  }

  public build(params: SingleTokenOrderParams): Order {
    const { collection, tokenId, numTokens, ...rest } = params;

    const order = new Order(this.chainId, {
      ...rest,
      extraParams: constants.HashZero,
      numItems: 1,
      nfts: [
        {
          collection: params.collection,
          tokens: [{ tokenId: params.tokenId, numTokens: params.numTokens }],
        },
      ],
      complication: Addresses.Complication[this.chainId],
    });

    return order;
  }
}
