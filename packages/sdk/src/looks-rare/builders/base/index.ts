import { BigNumberish } from "@ethersproject/bignumber";
import { HashZero } from "@ethersproject/constants";

import { Order } from "../../order";
import { TakerOrderParams } from "../../types";
import { getCurrentTimestamp, getRandomBytes } from "../../../utils";

export interface BaseBuildParams {
  isOrderAsk: boolean;
  signer: string;
  collection: string;
  currency: string;
  price: BigNumberish;
  nonce?: BigNumberish;
  startTime?: number;
  endTime?: number;
  minPercentageToAsk?: number;
  strategy?: string;
  v?: number;
  r?: string;
  s?: string;
}

export abstract class BaseBuilder {
  public chainId: number;

  constructor(chainId: number) {
    this.chainId = chainId;
  }

  protected defaultInitialize(params: BaseBuildParams) {
    params.startTime = params.startTime ?? getCurrentTimestamp(-1 * 60);
    params.endTime = params.endTime ?? getCurrentTimestamp(24 * 60 * 60);
    params.minPercentageToAsk = params.minPercentageToAsk ?? 8500;
    params.nonce = params.nonce ?? getRandomBytes(10);
    params.v = params.v ?? 0;
    params.r = params.r ?? HashZero;
    params.s = params.s ?? HashZero;
  }

  public abstract isValid(order: Order): boolean;
  public abstract build(params: BaseBuildParams): Order;
  public abstract buildMatching(
    order: Order,
    taker: string,
    data: any
  ): TakerOrderParams;
}
