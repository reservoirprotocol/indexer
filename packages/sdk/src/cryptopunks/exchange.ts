import { Signer } from "@ethersproject/abstract-signer";
import { Contract, ContractTransaction } from "@ethersproject/contracts";

import * as Addresses from "./addresses";
import { Order } from "./order";
import { TxData, bn, generateSourceBytes } from "../utils";

import ExchangeAbi from "./abis/Exchange.json";

// CryptoPunks:
// - escrowed orderbook
// - fully on-chain

export class Exchange {
  public chainId: number;
  public contract: Contract;

  constructor(chainId: number) {
    this.chainId = chainId;
    this.contract = new Contract(
      Addresses.Exchange[this.chainId],
      ExchangeAbi as any
    );
  }

  // --- Create listing ---

  public async createListing(
    maker: Signer,
    order: Order
  ): Promise<ContractTransaction> {
    const tx = this.createListingTx(order);
    return maker.sendTransaction(tx);
  }

  public createListingTx(order: Order): TxData {
    if (order.params.side !== "sell") {
      throw new Error("Invalid order side");
    }

    return {
      from: order.params.maker,
      to: this.contract.address,
      data: order.params.taker
        ? this.contract.interface.encodeFunctionData(
            "offerPunkForSaleToAddress",
            [order.params.tokenId, order.params.price, order.params.taker]
          )
        : this.contract.interface.encodeFunctionData("offerPunkForSale", [
            order.params.tokenId,
            order.params.price,
          ]),
    };
  }

  // --- Cancel listing ---

  public async cancelListing(
    maker: Signer,
    order: Order
  ): Promise<ContractTransaction> {
    const tx = this.cancelListingTx(order);
    return maker.sendTransaction(tx);
  }

  public cancelListingTx(order: Order): TxData {
    if (order.params.side !== "sell") {
      throw new Error("Invalid order side");
    }

    return {
      from: order.params.maker,
      to: this.contract.address,
      data: this.contract.interface.encodeFunctionData("punkNoLongerForSale", [
        order.params.tokenId,
      ]),
    };
  }

  // --- Fill listing ---

  public async fillListing(
    taker: Signer,
    order: Order,
    options?: {
      source?: string;
    }
  ): Promise<ContractTransaction> {
    const tx = this.fillListingTx(await taker.getAddress(), order, options);
    return taker.sendTransaction(tx);
  }

  public fillListingTx(
    taker: string,
    order: Order,
    options?: {
      source?: string;
    }
  ): TxData {
    return {
      from: taker,
      to: this.contract.address,
      data:
        this.contract.interface.encodeFunctionData("buyPunk", [
          order.params.tokenId,
        ]) + generateSourceBytes(options?.source),
      value: bn(order.params.price).toHexString(),
    };
  }

  // --- Create bid ---

  public async createBid(
    maker: Signer,
    order: Order
  ): Promise<ContractTransaction> {
    const tx = this.createBidTx(order);
    return maker.sendTransaction(tx);
  }

  public createBidTx(order: Order): TxData {
    if (order.params.side !== "buy") {
      throw new Error("Invalid order side");
    }

    return {
      from: order.params.maker,
      to: this.contract.address,
      data: this.contract.interface.encodeFunctionData("enterBidForPunk", [
        order.params.tokenId,
      ]),
      value: bn(order.params.price).toHexString(),
    };
  }

  // --- Cancel bid ---

  public async cancelBid(
    maker: Signer,
    order: Order
  ): Promise<ContractTransaction> {
    const tx = this.cancelBidTx(order);
    return maker.sendTransaction(tx);
  }

  public cancelBidTx(order: Order): TxData {
    if (order.params.side !== "buy") {
      throw new Error("Invalid order side");
    }

    return {
      from: order.params.maker,
      to: this.contract.address,
      data: this.contract.interface.encodeFunctionData("withdrawBidForPunk", [
        order.params.tokenId,
      ]),
    };
  }

  // --- Fill bid ---

  public async fillBid(
    taker: Signer,
    order: Order,
    options?: {
      source?: string;
    }
  ): Promise<ContractTransaction> {
    const tx = this.fillBidTx(await taker.getAddress(), order, options);
    return taker.sendTransaction(tx);
  }

  public fillBidTx(
    taker: string,
    order: Order,
    options?: {
      source?: string;
    }
  ): TxData {
    return {
      from: taker,
      to: this.contract.address,
      data:
        this.contract.interface.encodeFunctionData("acceptBidForPunk", [
          order.params.tokenId,
          order.params.price,
        ]) + generateSourceBytes(options?.source),
    };
  }
}
