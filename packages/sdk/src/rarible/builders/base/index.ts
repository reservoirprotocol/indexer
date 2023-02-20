import { getRandomBytes } from "../../../utils";
import { Order } from "../../order";
import * as Types from "../../types";

export interface BaseOrderInfo {
  side: "buy" | "sell";
}

export abstract class BaseBuilder {
  public chainId: number;

  constructor(chainId: number) {
    this.chainId = chainId;
  }

  protected defaultInitialize(params: Types.BaseBuildParams) {
    params.salt = params.salt ?? getRandomBytes();
  }

  public abstract getInfo(order: Order): BaseOrderInfo;
  public abstract isValid(order: Order): boolean;
  public abstract build(params: Types.BaseBuildParams): Order;
  public abstract buildMatching(
    order: Types.Order,
    taker: string,
    data: any
  ): Types.TakerOrderParams;
}
