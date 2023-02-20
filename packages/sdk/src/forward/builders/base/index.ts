import { BigNumberish } from "@ethersproject/bignumber";

import { Order } from "../../order";
import * as Types from "../../types";
import { getCurrentTimestamp, getRandomBytes } from "../../../utils";

export interface BaseBuildParams {
  maker: string;
  tokenKind: "erc721" | "erc1155";
  contract: string;
  unitPrice: BigNumberish;
  counter: BigNumberish;
  amount?: string;
  salt?: BigNumberish;
  expiration?: number;
  signature?: string;
}

export abstract class BaseBuilder {
  public chainId: number;

  constructor(chainId: number) {
    this.chainId = chainId;
  }

  protected defaultInitialize(params: BaseBuildParams) {
    params.amount = params.amount ?? "1";
    params.expiration = params.expiration ?? getCurrentTimestamp() + 24 * 3600;
    params.salt = params.salt ?? getRandomBytes(16);
    params.signature = params.signature ?? "0x";
  }

  public abstract isValid(order: Order): boolean;
  public abstract build(params: BaseBuildParams): Order;
  public abstract buildMatching(order: Order, data: any): Types.MatchParams;
}
