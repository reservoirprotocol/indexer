import { BigNumberish } from "@ethersproject/bignumber";
import { AddressZero, HashZero } from "@ethersproject/constants";

import { IOrder } from "../../order";
import { OrderProtocols, MatchedOrder, BaseOrder } from "../../types";
import { getCurrentTimestamp, getRandomBytes } from "../../../utils";

export type MatchingOptions = {
  taker: string;
  amount?: BigNumberish;
  tokenId?: BigNumberish;
  maxRoyaltyFeeNumerator?: BigNumberish;
  tokenIds?: BigNumberish[];
};

export interface BaseBuildParams {
  maker: string;
  protocol: OrderProtocols;
  tokenAddress: string;
  amount: BigNumberish;
  itemPrice: BigNumberish;
  expiration: BigNumberish;
  masterNonce: BigNumberish;
  paymentMethod: string;

  cosigner?: string;
  marketplace?: string;
  marketplaceFeeNumerator?: BigNumberish;
  maxRoyaltyFeeNumerator?: BigNumberish;
  nonce?: BigNumberish;
  tokenSetMerkleRoot?: string;
  fallbackRoyaltyRecipient?: string;

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
    params.marketplace = params.marketplace ?? AddressZero;
    params.cosigner = params.cosigner ?? AddressZero;
    params.marketplaceFeeNumerator = params.marketplaceFeeNumerator ?? "0";
    params.expiration = params.expiration ?? getCurrentTimestamp(60 * 60);
    params.nonce = params.nonce ?? getRandomBytes(10);
    params.v = params.v ?? 0;
    params.r = params.r ?? HashZero;
    params.s = params.s ?? HashZero;
  }

  // public abstract isValid(order: IOrder): boolean;
  // public abstract build(params: BaseBuildParams): IOrder;
  public abstract isValid<T extends IOrder>(
    order: IOrder,
    orderBuilder: { new (chainId: number, params: BaseOrder): T }
  ): boolean;

  public abstract build<T extends IOrder>(
    params: BaseBuildParams,
    orderBuilder: { new (chainId: number, params: BaseOrder): T }
  ): T;

  public abstract buildMatching(order: IOrder, options: MatchingOptions): MatchedOrder;
}
