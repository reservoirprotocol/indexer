import { constants } from "ethers";
import { Order, Types } from "../..";
import { BaseBuilder } from "../base";
import { getComplication } from "../../complications";

export type ContractWideOrderParams = Omit<
  Types.OrderInput,
  "complication" | "nfts" | "extraParams" | "trustedExecution"
> & { collection: string } & Partial<
    Pick<Types.OrderInput, "complication" | "trustedExecution">
  >;

export class ContractWideBuilder extends BaseBuilder<ContractWideOrderParams> {
  public isValid(order: Order): boolean {
    try {
      order.checkBaseValid();
      return order.kind === "contract-wide";
    } catch (err) {
      return false;
    }
  }

  public build(params: ContractWideOrderParams): Order {
    const { collection, ...rest } = params;

    const order = new Order(this.chainId, {
      trustedExecution: "0",
      complication: getComplication(this.chainId).address,
      ...rest,
      extraParams: constants.HashZero,
      nfts: [{ collection, tokens: [] }],
    });

    return order;
  }
}
