import { Provider } from "@ethersproject/abstract-provider";
import { Signer } from "@ethersproject/abstract-signer";
import { BigNumberish } from "ethers";
import { HashZero } from "@ethersproject/constants";
import { Contract, ContractTransaction } from "@ethersproject/contracts";

import * as Addresses from "./addresses";
import { Order } from "./order";
import * as CommonAddresses from "../common/addresses";
import { TxData, bn, generateSourceBytes } from "../utils";

import ExchangeAbi from "./abis/Exchange.json";

export class Exchange {
  public chainId: number;

  constructor(chainId: number) {
    this.chainId = chainId;
  }

  // --- Fill order ---

  public async fillOrder(
    taker: Signer,
    buyOrder: Order,
    sellOrder: Order,
    options?: {
      source?: string;
    }
  ): Promise<ContractTransaction> {
    const tx = this.fillOrderTx(
      await taker.getAddress(),
      buyOrder,
      sellOrder,
      options
    );
    return taker.sendTransaction(tx);
  }

  public fillOrderTx(
    taker: string,
    buyOrder: Order,
    sellOrder: Order,
    options?: {
      source?: string;
    }
  ): TxData {
    const addrs = [
      buyOrder.params.exchange,
      buyOrder.params.maker,
      buyOrder.params.taker,
      buyOrder.params.feeRecipient,
      buyOrder.params.target,
      buyOrder.params.staticTarget,
      buyOrder.params.paymentToken,
      sellOrder.params.exchange,
      sellOrder.params.maker,
      sellOrder.params.taker,
      sellOrder.params.feeRecipient,
      sellOrder.params.target,
      sellOrder.params.staticTarget,
      sellOrder.params.paymentToken,
    ];

    const uints = [
      buyOrder.params.makerRelayerFee,
      buyOrder.params.takerRelayerFee,
      0, // makerProtocolFee (always 0)
      0, // takerProtocolFee (always 0)
      buyOrder.params.basePrice,
      buyOrder.params.extra,
      buyOrder.params.listingTime,
      buyOrder.params.expirationTime,
      buyOrder.params.salt,
      sellOrder.params.makerRelayerFee,
      sellOrder.params.takerRelayerFee,
      0, // makerProtocolFee (always 0)
      0, // takerProtocolFee (always 0)
      sellOrder.params.basePrice,
      sellOrder.params.extra,
      sellOrder.params.listingTime,
      sellOrder.params.expirationTime,
      sellOrder.params.salt,
    ];

    const feeMethodsSidesKindsHowToCalls = [
      1, // feeMethod (always 1 - SplitFee)
      buyOrder.params.side,
      buyOrder.params.saleKind,
      buyOrder.params.howToCall,
      1, // feeMethod (always 1 - SplitFee)
      sellOrder.params.side,
      sellOrder.params.saleKind,
      sellOrder.params.howToCall,
    ];

    const data = new Contract(
      buyOrder.params.exchange,
      ExchangeAbi as any
    ).interface.encodeFunctionData("atomicMatch_", [
      addrs,
      uints,
      feeMethodsSidesKindsHowToCalls,
      buyOrder.params.calldata,
      sellOrder.params.calldata,
      buyOrder.params.replacementPattern,
      sellOrder.params.replacementPattern,
      buyOrder.params.staticExtradata,
      sellOrder.params.staticExtradata,
      [buyOrder.params.v, sellOrder.params.v],
      [
        buyOrder.params.r,
        buyOrder.params.s,
        sellOrder.params.r,
        sellOrder.params.s,
        HashZero.slice(0, -1) + "f",
      ],
    ]);

    const value =
      buyOrder.params.paymentToken === CommonAddresses.Eth[this.chainId]
        ? buyOrder.getMatchingPrice()
        : undefined;

    return {
      from: taker,
      to: buyOrder.params.exchange,
      data: data + generateSourceBytes(options?.source),
      value: value ? bn(value).toHexString() : undefined,
    };
  }

  public cancelTransaction(maker: string, order: Order): TxData {
    const addrs = [
      order.params.exchange,
      order.params.maker,
      order.params.taker,
      order.params.feeRecipient,
      order.params.target,
      order.params.staticTarget,
      order.params.paymentToken,
    ];

    const uints = [
      order.params.makerRelayerFee,
      order.params.takerRelayerFee,
      0, // makerProtocolFee (always 0)
      0, // takerProtocolFee (always 0)
      order.params.basePrice,
      order.params.extra,
      order.params.listingTime,
      order.params.expirationTime,
      order.params.salt,
    ];

    const data = new Contract(
      order.params.exchange,
      ExchangeAbi as any
    ).interface.encodeFunctionData("cancelOrder_", [
      addrs,
      uints,
      1, // feeMethod (always 1 - SplitFee)
      order.params.side,
      order.params.saleKind,
      order.params.howToCall,
      order.params.calldata,
      order.params.replacementPattern,
      order.params.staticExtradata,
      order.params.v,
      order.params.r,
      order.params.s,
    ]);

    return { from: maker, to: order.params.exchange, data };
  }

  public async cancel(
    maker: Signer,
    order: Order
  ): Promise<ContractTransaction> {
    const addrs = [
      order.params.exchange,
      order.params.maker,
      order.params.taker,
      order.params.feeRecipient,
      order.params.target,
      order.params.staticTarget,
      order.params.paymentToken,
    ];

    const uints = [
      order.params.makerRelayerFee,
      order.params.takerRelayerFee,
      0, // makerProtocolFee (always 0)
      0, // takerProtocolFee (always 0)
      order.params.basePrice,
      order.params.extra,
      order.params.listingTime,
      order.params.expirationTime,
      order.params.salt,
    ];

    return new Contract(order.params.exchange, ExchangeAbi as any)
      .connect(maker)
      .cancelOrder_(
        addrs,
        uints,
        1, // feeMethod (always 1 - SplitFee)
        order.params.side,
        order.params.saleKind,
        order.params.howToCall,
        order.params.calldata,
        order.params.replacementPattern,
        order.params.staticExtradata,
        order.params.v,
        order.params.r,
        order.params.s
      );
  }

  public async incrementNonce(user: Signer): Promise<ContractTransaction> {
    return new Contract(Addresses.Exchange[this.chainId], ExchangeAbi as any)
      .connect(user)
      .incrementNonce();
  }

  public async getNonce(
    provider: Provider,
    user: string
  ): Promise<BigNumberish> {
    return new Contract(Addresses.Exchange[this.chainId], ExchangeAbi as any)
      .connect(provider)
      .nonces(user);
  }
}
