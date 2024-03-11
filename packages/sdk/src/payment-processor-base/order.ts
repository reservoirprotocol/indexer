import { BigNumberish } from "@ethersproject/bignumber";
import * as Types from "./types";
import { MatchingOptions } from "./types";
import { TypedDataSigner } from "@ethersproject/abstract-signer";

export interface IOrder {
  chainId: number;
  params: Types.BaseOrder;

  hash(): string;
  hashDigest(): string;
  isBuyOrder(): boolean;

  isCosignedOrder(): boolean;

  isCollectionLevelOffer(): boolean;

  isPartial(): boolean;

  checkValidity(): void;

  cosign(cosigner: TypedDataSigner, taker: string): void;
  getCosignature(): Types.Cosignature;
  getTokenSetProof(): Types.TokenSetProof;

  getMatchedOrder(
    taker: string,
    options?: {
      amount?: BigNumberish;
      tokenId?: BigNumberish;
      maxRoyaltyFeeNumerator?: BigNumberish;
    }
  ): Types.MatchedOrder;

  buildMatching(options: MatchingOptions): Types.MatchedOrder;
}
