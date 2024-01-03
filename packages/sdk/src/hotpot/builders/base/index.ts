import { OfferTokenType, OrderParameters } from "../../types";
import { BigNumberish } from "@ethersproject/bignumber";
import { HashZero, AddressZero } from "@ethersproject/constants";
import { getCurrentTimestamp } from "../../../utils";
import { Order } from "../../order";
import { Common } from "../../..";

export interface BaseBuildParams {
  currency?: string;

  offerer: string;
  collectionType: OfferTokenType;
  tokenContract: string;
  price: BigNumberish;
  amount?: BigNumberish;
  endTime?: number;
  royaltyPercent?: number;
  royaltyRecepient?: string;
  salt?: BigNumberish;
  orderSignature?: string;
}

export abstract class BaseBuilder {
  public chainId: number;

  constructor(chainId: number) {
    this.chainId = chainId;
  }

  protected defaultInitialize(params: BaseBuildParams) {
    params.endTime = params.endTime ?? getCurrentTimestamp(24 * 60 * 60);
    params.orderSignature = params.orderSignature ?? HashZero;
    params.amount = params.amount ?? 1;
    params.salt = params.salt ?? Math.floor(Math.random() * 10000);
    params.royaltyRecepient = params.royaltyRecepient ?? AddressZero;
    params.royaltyPercent = params.royaltyPercent ?? 0;
    params.currency = params.currency ?? Common.Addresses.Native[this.chainId];
  }

  public abstract isValid(order: Order): boolean;
  public abstract build(params: BaseBuildParams): Order;
  public abstract buildMatching(
    order: Order,
    receiver: string,
    buyerPendingAmount: BigNumberish,
    offererPendingAmount: BigNumberish
  ): Promise<OrderParameters>;
}
