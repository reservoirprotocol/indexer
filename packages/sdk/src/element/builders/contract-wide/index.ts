import { BigNumberish } from "@ethersproject/bignumber";
import { AddressZero } from "@ethersproject/constants";

import { BaseBuildParams, BaseBuilder } from "../base";
import { Order } from "../../order";
import * as Types from "../../types";
import { BytesEmpty, lc, s } from "../../../utils";

interface BuildParams extends BaseBuildParams {}

export class ContractWideBuilder extends BaseBuilder {
  public isValid(order: Order): boolean {
    try {
      const params = order.params as Types.BaseOrder;
      const copyOrder = this.build({
        ...params,
        direction:
          params.direction === Types.TradeDirection.SELL ? "sell" : "buy",
        contract: params.nft,
        maker: params.maker,
        paymentToken: params.erc20Token,
        price: params.erc20TokenAmount,
        amount: params.nftAmount,
      });

      if (!copyOrder) {
        return false;
      }

      if (copyOrder.hash() !== order.hash()) {
        return false;
      }
    } catch {
      return false;
    }

    return true;
  }

  public build(params: BuildParams) {
    this.defaultInitialize(params);

    return new Order(this.chainId, {
      kind: params.amount ? "erc1155-contract-wide" : "erc721-contract-wide",
      direction:
        params.direction === "sell"
          ? Types.TradeDirection.SELL
          : Types.TradeDirection.BUY,
      maker: params.maker,
      taker: AddressZero,
      expiry: s(params.expiry)!,
      nonce: s(params.nonce)!,
      erc20Token: params.paymentToken,
      erc20TokenAmount: s(params.price),
      hashNonce: s(params.hashNonce),
      fees: params.fees!.map(({ recipient, amount }) => ({
        recipient: lc(recipient),
        amount: s(amount),
        feeData: BytesEmpty,
      })),
      nft: params.contract,
      nftId: "0",
      nftProperties: [
        {
          // The zero address is basically a no-op (will accept any token id).
          propertyValidator: AddressZero,
          propertyData: "0x",
        },
      ],
      nftAmount: params.amount ? s(params.amount) : undefined,
      signatureType: params.signatureType,
      v: params.v,
      r: params.r,
      s: params.s,
    });
  }

  public buildMatching(
    _order: Order,
    data: {
      tokenId: BigNumberish;
      amount?: BigNumberish;
      unwrapNativeToken?: boolean;
    }
  ) {
    return {
      nftId: s(data.tokenId),
      nftAmount: data.amount ? s(data.amount) : "1",
      unwrapNativeToken: data.unwrapNativeToken,
    };
  }
}
