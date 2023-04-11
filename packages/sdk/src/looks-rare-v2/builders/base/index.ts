import { BigNumberish } from "@ethersproject/bignumber";
import { HashZero } from "@ethersproject/constants";

import { Order } from "../../order";
import { TakerOrderParams, QuoteType, CollectionType } from "../../types";
import { getCurrentTimestamp, getRandomBytes } from "../../../utils";

export interface BaseBuildParams {
  quoteType: QuoteType;
  globalNonce?: BigNumberish;
  subsetNonce?: BigNumberish;
  orderNonce?: BigNumberish;
  strategyId?: number;
  collectionType: CollectionType;

  collection: string;
  currency: string;
  price: BigNumberish;
  signer: string;

  startTime: number;
  endTime: number;

  additionalParameters?: string;
  signature?: string;
}

export abstract class BaseBuilder {
  public chainId: number;

  constructor(chainId: number) {
    this.chainId = chainId;
  }

  protected defaultInitialize(params: BaseBuildParams) {
    params.startTime = params.startTime ?? getCurrentTimestamp(-1 * 60);
    params.endTime = params.endTime ?? getCurrentTimestamp(24 * 60 * 60);

    params.orderNonce = params.orderNonce ?? getRandomBytes(10);
    params.globalNonce = params.globalNonce ?? "0";
    params.subsetNonce = params.subsetNonce ?? "0";

    params.signature = params.signature ?? HashZero;
  }

  public abstract isValid(order: Order): boolean;
  public abstract build(params: BaseBuildParams): Order;
  public abstract buildMatching(
    order: Order,
    taker: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: any
  ): TakerOrderParams;
}
