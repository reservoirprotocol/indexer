import { Provider } from "@ethersproject/abstract-provider";
import { Signer } from "@ethersproject/abstract-signer";
import { BigNumber, BigNumberish } from "@ethersproject/bignumber";
import {
  Contract,
  ContractTransaction,
  PopulatedTransaction,
} from "@ethersproject/contracts";

import * as Addresses from "./addresses";
import { Order } from "./order";
import * as Types from "./types";
import {
  encodeForContract as v2Encode,
  encodeForMatchOrders as v1Encode,
} from "./utils";
import { TxData, generateSourceBytes } from "../utils";

import ExchangeAbi from "./abis/Exchange.json";

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

  // --- Fill order ---

  public async fillOrder(
    taker: Signer,
    makerOrder: Order,
    options: {
      assetClass?: "ERC721" | "ERC1155";
      tokenId?: string;
      amount?: number;
      source?: string;
    }
  ): Promise<ContractTransaction> {
    const tx = await this.fillOrderTx(
      await taker.getAddress(),
      makerOrder,
      options
    );
    return taker.sendTransaction(tx);
  }

  public async fillOrderTx(
    taker: string,
    makerOrder: Order,
    options: {
      tokenId?: string;
      assetClass?: string;
      source?: string;
      amount?: number;
    }
  ): Promise<TxData> {
    let result: PopulatedTransaction;
    const side = makerOrder.getInfo()?.side;
    const takerOrderParams = makerOrder.buildMatching(taker, options);
    const value = this.calculateTxValue(
      makerOrder.params.take.assetType.assetClass,
      makerOrder.params.take.value
    );

    //TODO: We can refactor this in the future to use directAcceptBid function to cost less gass
    if (
      side === "buy" &&
      makerOrder.params.take.assetType.assetClass ===
        Types.AssetClass.COLLECTION
    ) {
      result = await this.contract.populateTransaction.matchOrders(
        v1Encode(makerOrder.params),
        makerOrder.params.signature,
        v1Encode(takerOrderParams),
        "0x",
        {
          from: taker,
          value: value.toString(),
        }
      );
    } else if (
      side === "buy" &&
      (makerOrder.params.take.assetType.assetClass ===
        Types.AssetClass.ERC1155 ||
        makerOrder.params.take.assetType.assetClass === Types.AssetClass.ERC721)
    ) {
      const encodedOrder = v2Encode(makerOrder.params, takerOrderParams);
      result = await this.contract.populateTransaction.directAcceptBid(
        encodedOrder,
        {
          from: taker,
          value: value.toString(),
        }
      );
    } else if (side === "sell") {
      const encodedOrder = v2Encode(makerOrder.params, takerOrderParams);
      result = await this.contract.populateTransaction.directPurchase(
        encodedOrder,
        {
          from: taker,
          value: value.toString(),
        }
      );
    } else {
      throw Error("Unknown order side");
    }

    return {
      from: result.from!,
      to: result.to!,
      data: result.data + generateSourceBytes(options?.source),
      value: result.value && result.value.toHexString(),
    };
  }

  /**
   * Calculate transaction value in case its a ETH order
   */
  public calculateTxValue(takeClass: string, takeAmount: string) {
    let value = BigNumber.from(0);
    // "ETH" can only be TAKE'a asset class in case it is a direct buy from a listing.
    // In this case transaction value is the ETH value from order.take.amount.
    // There can't be situations when ETH is a MAKE's asset class
    if (takeClass === "ETH") {
      value = BigNumber.from(takeAmount);
    }

    return value;
  }

  // --- Cancel order ---

  public async cancelOrder(
    maker: Signer,
    order: Order
  ): Promise<ContractTransaction> {
    const tx = await this.cancelOrderTx(order.params);
    return maker.sendTransaction(tx);
  }

  public async cancelOrderTx(orderParams: Types.Order): Promise<TxData> {
    const { from, to, data, value } =
      await this.contract.populateTransaction.cancel(v1Encode(orderParams));

    return {
      from: from!,
      to: to!,
      data: data!,
      value: value && value.toHexString(),
    };
  }

  /**
   * Get the fill amount of a specifc order
   * @returns uint256 order fill
   */
  public async getOrderFill(
    provider: Provider,
    order: Order
  ): Promise<BigNumberish> {
    const hash = order.hashOrderKey();
    return this.contract.connect(provider).fills(hash);
  }
}
