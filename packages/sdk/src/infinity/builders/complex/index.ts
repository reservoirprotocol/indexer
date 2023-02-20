import { constants } from "ethers";
import { Addresses, Order, Types } from "../..";
import { BaseBuilder } from "../base";

export type ComplexOrderParams = Omit<
  Types.OrderInput,
  "complication" | "extraParams"
>;

export class ComplexBuilder extends BaseBuilder<ComplexOrderParams> {
  public isValid(order: Order): boolean {
    try {
      order.checkBaseValid();
      return true;
    } catch (err) {
      return false;
    }
  }

  public build(params: ComplexOrderParams): Order {
    const order = new Order(this.chainId, {
      ...params,
      extraParams: constants.HashZero,
      complication: Addresses.Complication[this.chainId],
    });

    return order;
  }
}
