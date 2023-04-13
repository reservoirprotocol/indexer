import * as Addresses from "./addresses";
import * as Types from "../seaport-base/types";
import { IOrder, SeaportOrderKind } from "../seaport-base/order";

import { Exchange } from "./exchange";
import { Order as SeaportV14Order } from "../seaport-v1.4/order";

export class Order extends SeaportV14Order implements IOrder {
  constructor(chainId: number, params: Types.OrderComponents) {
    super(chainId, params);
    this.exchangeAddress = Addresses.Exchange[chainId];
    this.exchange = new Exchange(chainId);
  }

  public getKind(): SeaportOrderKind {
    return SeaportOrderKind.ALIENSWAP;
  }
}
