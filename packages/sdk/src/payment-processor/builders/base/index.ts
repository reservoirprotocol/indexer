import { BigNumberish } from "@ethersproject/bignumber";
import { AddressZero, HashZero } from "@ethersproject/constants";

import { Order } from "../../order";
import { TokenProtocols } from "../../types";
import { getCurrentTimestamp, getRandomBytes } from "../../../utils";

export type MatchingOptions = {
  taker: string;
  takerMasterNonce: BigNumberish;
  tokenId?: BigNumberish;
  maxRoyaltyFeeNumerator?: BigNumberish;
};

export interface BaseBuildParams {
  trader: string;
  protocol: TokenProtocols;
  tokenAddress: string;
  amount: BigNumberish;
  price: BigNumberish;
  expiration: BigNumberish;
  masterNonce: BigNumberish;
  coin: string;

  marketplace?: string;
  marketplaceFeeNumerator?: BigNumberish;
  nonce?: BigNumberish;

  sellerAcceptedOffer?: boolean;
  maxRoyaltyFeeNumerator?: BigNumberish;

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
    params.marketplaceFeeNumerator = params.marketplaceFeeNumerator ?? "0";
    params.maxRoyaltyFeeNumerator = params.maxRoyaltyFeeNumerator ?? "0";
    params.expiration = params.expiration ?? getCurrentTimestamp(60 * 60);
    params.nonce = params.nonce ?? getRandomBytes(10);
    params.v = params.v ?? 0;
    params.r = params.r ?? HashZero;
    params.s = params.s ?? HashZero;
  }

  public abstract isValid(order: Order): boolean;
  public abstract build(params: BaseBuildParams): Order;
  public abstract buildMatching(order: Order, options: MatchingOptions): Order;
}
