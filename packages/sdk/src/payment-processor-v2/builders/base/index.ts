import { BigNumberish } from "@ethersproject/bignumber";
import { AddressZero, HashZero } from "@ethersproject/constants";

import { Order } from "../../order";
import { OrderProtocols, MatchedOrder } from "../../types";
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

  public abstract isValid(order: Order): boolean;
  public abstract build(params: BaseBuildParams): Order;
  public abstract buildMatching(order: Order, options: MatchingOptions): MatchedOrder;
}
