import { Exchange } from "./exchange";
import * as Types from "../seaport-base/types";
import { IOrder } from "../seaport-base/order";
import { Order as SeaportV14Order } from "../seaport-v1.4/order";

export class Order extends SeaportV14Order implements IOrder {
  constructor(chainId: number, params: Types.OrderComponents) {
    super(chainId, params);
  }

  public exchange() {
    return new Exchange(this.chainId);
  }
}
