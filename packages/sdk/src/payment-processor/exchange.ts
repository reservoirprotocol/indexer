import { Interface, Result } from "@ethersproject/abi";
import { Provider } from "@ethersproject/abstract-provider";
import { Signer } from "@ethersproject/abstract-signer";
import { BigNumber } from "@ethersproject/bignumber";
import { splitSignature } from "@ethersproject/bytes";
import { AddressZero } from "@ethersproject/constants";
import { Contract, ContractTransaction } from "@ethersproject/contracts";

import * as Addresses from "./addresses";
import { Order } from "./order";
import { TxData, bn, generateSourceBytes } from "../utils";

import ExchangeAbi from "./abis/PaymentProcessor.json";

export class Exchange {
  public chainId: number;
  public contract: Contract;

  constructor(chainId: number) {
    this.chainId = chainId;
    this.contract = new Contract(Addresses.Exchange[this.chainId], ExchangeAbi);
  }

  // --- Get master nonce ---

  public async getMasterNonce(provider: Provider, user: string): Promise<BigNumber> {
    return this.contract.connect(provider).masterNonces(user);
  }

  // --- Cancel order ---

  public async cancelOrder(maker: Signer, order: Order): Promise<ContractTransaction> {
    const tx = this.cancelOrderTx(await maker.getAddress(), order);
    return maker.sendTransaction(tx);
  }

  public cancelOrderTx(maker: string, order: Order): TxData {
    return {
      from: maker,
      to: this.contract.address,
      data: this.contract.interface.encodeFunctionData("revokeSingleNonce", [
        order.params.marketplace,
        order.params.nonce,
      ]),
    };
  }

  // --- Increase master nonce ---

  public async revokeMasterNonce(maker: Signer): Promise<ContractTransaction> {
    const tx = this.revokeMasterNonceTx(await maker.getAddress());
    return maker.sendTransaction(tx);
  }

  public revokeMasterNonceTx(maker: string): TxData {
    const data: string = this.contract.interface.encodeFunctionData("revokeMasterNonce", []);
    return {
      from: maker,
      to: this.contract.address,
      data,
    };
  }

  // --- Fill single order ---

  public async fillOrder(
    taker: Signer,
    order: Order,
    matchOrder: Order,
    options?: {
      source?: string;
    }
  ): Promise<ContractTransaction> {
    const tx = this.fillOrderTx(await taker.getAddress(), order, matchOrder, options);
    return taker.sendTransaction(tx);
  }

  public fillOrderTx(
    taker: string,
    order: Order,
    matchOrder: Order,
    options?: {
      source?: string;
    }
  ): TxData {
    const matchedOrder = order.getMatchedOrder(matchOrder);

    const data = this.contract.interface.encodeFunctionData("buySingleListing", [
      matchedOrder,
      matchedOrder.listingSignature,
      matchedOrder.offerSignature,
    ]);
    const passValue =
      matchedOrder.buyer === taker.toLowerCase() && matchedOrder.paymentCoin === AddressZero;

    return {
      from: taker,
      to: this.contract.address,
      value: passValue ? order.params.price.toString() : "0",
      data: data + generateSourceBytes(options?.source),
    };
  }

  // --- Fill multiple orders ---

  public fillOrdersTx(
    taker: string,
    orders: Order[],
    matchOrders: Order[],
    options?: {
      source?: string;
    }
  ): TxData {
    if (orders.length === 1) {
      return this.fillOrderTx(taker, orders[0], matchOrders[0], options);
    }

    let price = bn(0);
    const saleDetails = orders.map((c, i) => {
      const matchedOrder = c.getMatchedOrder(matchOrders[i]);

      const passValue =
        matchedOrder.buyer === taker.toLowerCase() && matchedOrder.paymentCoin === AddressZero;
      if (passValue) {
        price = price.add(c.params.price);
      }

      return matchedOrder;
    });

    const data = this.contract.interface.encodeFunctionData("buyBatchOfListings", [
      saleDetails,
      saleDetails.map((c) => c.listingSignature),
      saleDetails.map((c) => c.offerSignature),
    ]);

    return {
      from: taker,
      to: this.contract.address,
      value: price.toString(),
      data: data + generateSourceBytes(options?.source),
    };
  }

  // --- Fill multiple listings from the same collection ---

  public sweepCollectionTx(
    taker: string,
    bundledOrder: Order,
    orders: Order[],
    options?: {
      source?: string;
    }
  ): TxData {
    let price = bn(0);

    const sweepMatchedOrder = bundledOrder.getSweepMatchedOrder(orders);
    if (sweepMatchedOrder.bundleDetails.paymentCoin === AddressZero) {
      price = price.add(bundledOrder.params.price);
    }

    const data = this.contract.interface.encodeFunctionData("sweepCollection", [
      sweepMatchedOrder.signedOffer,
      sweepMatchedOrder.bundleDetails,
      sweepMatchedOrder.bundleItems,
      sweepMatchedOrder.signedListings,
    ]);

    return {
      from: taker,
      to: this.contract.address,
      value: price.toString(),
      data: data + generateSourceBytes(options?.source),
    };
  }

  // --- Check if operator is allowed to transfer ---

  public async isTransferAllowed(
    provider: Provider,
    contract: string,
    operator: string,
    from: string,
    to: string
  ) {
    const c = new Contract(
      contract,
      new Interface([
        "function isTransferAllowed(address caller, address from, address to) view returns (bool)",
      ]),
      provider
    );
    return c.isTransferAllowed(operator, from, to);
  }

  // --- Attach signatures ---

  public attachTakerSignatures(txData: string, signatures: string[]) {
    const iface = this.contract.interface;

    const { name: methodName, args: inputs } = iface.parseTransaction({
      data: txData,
    });

    const rawCalldata = iface.encodeFunctionData(methodName, inputs);
    const sourceBytes = txData.substring(rawCalldata.length, txData.length);

    let newInputs = [];
    if (["buyBatchOfListings", "buySingleListing"].includes(methodName)) {
      const isBatch = methodName === "buyBatchOfListings";
      const saleDetailsArray = isBatch ? inputs.saleDetailsArray : [inputs.saleDetails];
      const signedListings = isBatch ? inputs.signedListings : [inputs.signedListing];
      const signedOffers = isBatch ? inputs.signedOffers : [inputs.signedOffer];

      const newSaleDetails = saleDetailsArray.map((c: Result, i: number) => {
        const signedListing = signedListings[i];
        const signedOffer = signedOffers[i];

        const { r, s, v } = splitSignature(signatures[i]);

        let newSignedListing = {
          r: signedListing.r,
          s: signedListing.s,
          v: signedListing.v,
        };
        if (signedListing.v === 0) {
          newSignedListing = {
            r,
            s,
            v,
          };
        }

        let newSignedOffer = {
          r: signedOffer.r,
          s: signedOffer.s,
          v: signedOffer.v,
        };
        if (signedOffer.v === 0) {
          newSignedOffer = {
            r,
            s,
            v,
          };
        }

        return {
          saleDetail: c,
          signedListing: newSignedListing,
          signedOffer: newSignedOffer,
        };
      });

      if (isBatch) {
        newInputs = [
          newSaleDetails.map((c: Result) => c.saleDetail),
          newSaleDetails.map((c: Result) => c.signedListing),
          newSaleDetails.map((c: Result) => c.signedOffer),
        ];
      } else {
        newInputs = [
          newSaleDetails[0].saleDetail,
          newSaleDetails[0].signedListing,
          newSaleDetails[0].signedOffer,
        ];
      }
    } else {
      const { r, s, v } = splitSignature(signatures[0]);
      newInputs = [
        {
          r,
          s,
          v,
        },
        inputs.bundleDetails,
        inputs.bundleItems,
        inputs.signedListings,
      ];
    }

    return iface.encodeFunctionData(methodName, newInputs) + sourceBytes;
  }
}
