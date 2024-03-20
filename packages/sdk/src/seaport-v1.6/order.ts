import { Exchange } from "./exchange";
import * as Types from "../seaport-base/types";
import { Order as OrderV15 } from "../seaport-v1.5/order";

export class Order extends OrderV15 {
  constructor(chainId: number, params: Types.OrderComponents) {
    super(chainId, params);
  }

  // Overrides

  public exchange() {
    return new Exchange(this.chainId);
  }
}
