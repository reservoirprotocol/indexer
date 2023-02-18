import { constants } from "ethers";
import { Order, Types } from "../..";
import { BaseBuilder } from "../base";
import { getComplication } from "../../complications";

export type SingleTokenOrderParams = Omit<
  Types.OrderInput,
  "complication" | "numItems" | "nfts" | "extraParams" | "trustedExecution"
> & { collection: string; tokenId: string; numTokens: number } & Partial<
    Pick<Types.OrderInput, "complication" | "trustedExecution">
  >;

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
      complication: getComplication(this.chainId).address,
      trustedExecution: "0",
      ...rest,
      extraParams: constants.HashZero,
      numItems: 1,
      nfts: [
        {
          collection: params.collection,
          tokens: [{ tokenId: params.tokenId, numTokens: params.numTokens }],
        },
      ],
    });

    return order;
  }
}
