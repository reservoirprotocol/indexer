import { BigNumberish } from "@ethersproject/bignumber";
import { HashZero } from "@ethersproject/constants";

import { Order } from "../../order";
import { bn, getCurrentTimestamp, getRandomBytes } from "../../../utils";
import { OrderSaleKind } from "../../types";

export interface BaseBuildParams {
  maker: string;
  side: "buy" | "sell";
  price: BigNumberish;
  paymentToken: string;
  fee: number;
  feeRecipient: string;
  nonce: BigNumberish;
  recipient?: string;
  listingTime?: number;
  expirationTime?: number;
  salt?: BigNumberish;
  extra?: BigNumberish;
  v?: number;
  r?: string;
  s?: string;
}

export interface BaseOrderInfo {
  contract: string;
}

export abstract class BaseBuilder {
  public chainId: number;

  constructor(chainId: number) {
    this.chainId = chainId;
  }

  protected defaultInitialize(params: BaseBuildParams) {
    // Default listing time is 5 minutes in the past to allow for any
    // time discrepancies when checking the order's validity on-chain
    params.listingTime = params.listingTime ?? getCurrentTimestamp(-5 * 60);
    params.expirationTime = params.expirationTime ?? 0;
    params.salt = params.salt ?? getRandomBytes();
    params.extra = params.extra ?? "0";
    params.v = params.v ?? 0;
    params.r = params.r ?? HashZero;
    params.s = params.s ?? HashZero;

    if (this.isDutchAuction(params)) {
      this.validateDutchAuction(params);
      return OrderSaleKind.DUTCH_AUCTION;
    } else {
      return OrderSaleKind.FIXED_PRICE;
    }
  }

  protected isDutchAuction(params: BaseBuildParams) {
    // The order's `extra` parameters specifies dutch auction details
    return bn(params?.extra || 0).gt(0);
  }

  protected validateDutchAuction(params: BaseBuildParams) {
    if (this.isDutchAuction(params)) {
      // Make sure the expiration time is valid
      if (bn(params.listingTime!).gte(bn(params.expirationTime!))) {
        throw new Error("Invalid listing/expiration time");
      }

      // We don't support dutch auctions for buy orders
      if (params.side === "buy") {
        throw new Error("Unsupported side");
      }
    }
  }

  public abstract getInfo(order: Order): BaseOrderInfo | undefined;
  public abstract isValid(order: Order): boolean;
  public abstract build(params: BaseBuildParams): Order;
  public abstract buildMatching(order: Order, taker: string, data: any): Order;
}
