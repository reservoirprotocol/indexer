import { Signer } from "@ethersproject/abstract-signer";
import { Provider } from "@ethersproject/abstract-provider";
import { Contract, ContractTransaction } from "@ethersproject/contracts";

import * as Addresses from "./addresses";
import { Order } from "./order";
import { TxData, bn, generateSourceBytes } from "../utils";

import ExchangeAbi from "./abis/Exchange.json";

// Manifold:
// - escrowed orderbook
// - fully on-chain

export class Exchange {
  public chainId: number;
  public contract: Contract;

  constructor(chainId: number) {
    this.chainId = chainId;
    this.contract = new Contract(Addresses.Exchange[this.chainId], ExchangeAbi);
  }

  // --- Get listing ---

  public async getListing(provider: Provider, listingId: number | string) {
    return this.contract.connect(provider).getListing(listingId);
  }

  // --- Create order ---

  public async createOrder(
    maker: Signer,
    order: Order
  ): Promise<ContractTransaction> {
    const tx = this.createOrderTx(order);
    return maker.sendTransaction(tx);
  }

  public createOrderTx(order: Order): TxData {
    return {
      from: order.params.seller,
      to: this.contract.address,
      data: this.contract.interface.encodeFunctionData("createListing", [
        order.params.details, // listingDetails
        order.params.token, // tokenDetails
        order.params.fees, // deliveryFees
        [], // listingReceivers
        order.params.referrerBPS > 0, // enableReferrer
        [], // data
      ]),
    };
  }

  // --- Fill order ---

  public async fillOrder(
    taker: Signer,
    listingId: number,
    amount: number,
    price: string,
    options?: {
      source?: string;
    }
  ): Promise<ContractTransaction> {
    const tx = this.fillOrderTx(
      await taker.getAddress(),
      listingId,
      amount,
      price,
      options
    );
    return taker.sendTransaction(tx);
  }

  public fillOrderTx(
    taker: string,
    listingId: number,
    amount: number,
    price: string,
    options?: {
      source?: string;
    }
  ): TxData {
    return {
      from: taker,
      to: this.contract.address,
      data:
        this.contract.interface.encodeFunctionData(
          "purchase(address, uint40, uint24)",
          [taker, listingId, amount]
        ) + generateSourceBytes(options?.source),
      value: bn(price).toHexString(),
    };
  }
}
