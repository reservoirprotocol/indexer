import { Signer } from "@ethersproject/abstract-signer";
import { BigNumber } from "@ethersproject/bignumber";
import { MaxUint256 } from "@ethersproject/constants";
import { Contract, ContractTransaction } from "@ethersproject/contracts";
import { Provider } from "@ethersproject/abstract-provider";

import * as Addresses from "./addresses";
import * as CommonAddresses from "../common/addresses";
import { Order } from "./order";
import * as Types from "./types";
import { BytesEmpty, TxData, bn, generateSourceBytes } from "../utils";

import ExchangeAbi from "./abis/Exchange.json";

export class Exchange {
  public chainId: number;
  public contract: Contract;

  constructor(chainId: number) {
    this.chainId = chainId;
    this.contract = new Contract(Addresses.Exchange[this.chainId], ExchangeAbi);
  }

  // --- Fill order ---

  public async fillOrder(
    taker: Signer,
    order: Order,
    matchParams: Types.MatchParams,
    options?: {
      noDirectTransfer?: boolean;
      source?: string;
    }
  ): Promise<ContractTransaction> {
    const tx = this.fillOrderTx(
      await taker.getAddress(),
      order,
      matchParams,
      options
    );
    return taker.sendTransaction(tx);
  }

  public fillOrderTx(
    taker: string,
    order: Order,
    matchParams: Types.MatchParams,
    options?: {
      noDirectTransfer?: boolean;
      source?: string;
    }
  ): TxData {
    const to = this.contract.address;
    let data: string;
    let value: BigNumber | undefined;

    if (order.side() == "sell") {
      if (order.isBatchSignedOrder()) {
        const raw = order.getRaw();

        // data1 [56 bits(startNonce) + 8 bits(v) + 32 bits(listingTime) + 160 bits(maker)]
        const data1 = bn(raw.startNonce)
          .shl(200)
          .or(bn(raw.v).shl(192))
          .or(bn(raw.listingTime).shl(160))
          .or(bn(raw.maker))
          .and(MaxUint256);

        // data2 [64 bits(taker part1) + 32 bits(expiryTime) + 160 bits(erc20Token)]
        const data2 = bn(taker)
          .shr(96)
          .shl(192)
          .or(bn(raw.expirationTime).shl(160))
          .or(bn(raw.erc20Token))
          .and(MaxUint256);

        // data3 [96 bits(taker part2) + 160 bits(platformFeeRecipient)]
        const data3 = bn(taker)
          .shl(160)
          .or(bn(raw.platformFeeRecipient))
          .and(MaxUint256);

        data = this.contract.interface.encodeFunctionData(
          "fillBatchSignedERC721Order",
          [
            {
              data1,
              data2,
              data3,
              r: raw.r,
              s: raw.s,
            },
            raw.collectionsBytes,
          ]
        );
      } else if (order.contractKind() == "erc721") {
        data = this.contract.interface.encodeFunctionData("buyERC721Ex", [
          order.getRaw(),
          order.params,
          taker,
          BytesEmpty,
        ]);
      } else {
        data = this.contract.interface.encodeFunctionData("buyERC1155Ex", [
          order.getRaw(),
          order.params,
          taker,
          matchParams.nftAmount!,
          BytesEmpty,
        ]);
      }

      if (order.erc20Token() == CommonAddresses.Eth[this.chainId]) {
        value = order.getTotalPrice(matchParams.nftAmount);
      }
    } else {
      const unwrapNativeToken =
        order.erc20Token() == CommonAddresses.Weth[this.chainId].toLowerCase()
          ? matchParams.unwrapNativeToken ?? true
          : false;
      if (order.contractKind() == "erc721") {
        data = this.contract.interface.encodeFunctionData("sellERC721", [
          order.getRaw(),
          order.params,
          matchParams.nftId!,
          unwrapNativeToken,
          BytesEmpty,
        ]);
      } else {
        data = this.contract.interface.encodeFunctionData("sellERC1155", [
          order.getRaw(),
          order.params,
          matchParams.nftId!,
          matchParams.nftAmount!,
          unwrapNativeToken,
          BytesEmpty,
        ]);
      }
    }

    if (order.isBatchSignedOrder()) {
      // BatchSignedOrder don't support sourceBytes.
    } else {
      data += generateSourceBytes(options?.source);
    }

    return {
      from: taker,
      to,
      data: data,
      value: value && bn(value).toHexString(),
    };
  }

  // --- Cancel order ---

  public async cancelOrder(
    maker: Signer,
    order: Order
  ): Promise<ContractTransaction> {
    const tx = this.cancelOrderTx(await maker.getAddress(), order);
    return maker.sendTransaction(tx);
  }

  public cancelOrderTx(maker: string, order: Order): TxData {
    let data: string;
    if (order.contractKind() == "erc721") {
      data = this.contract.interface.encodeFunctionData("cancelERC721Order", [
        order.params.nonce,
      ]);
    } else {
      data = this.contract.interface.encodeFunctionData("cancelERC1155Order", [
        order.params.nonce,
      ]);
    }

    return {
      from: maker,
      to: this.contract.address,
      data,
    };
  }

  // --- Get hashNonce ---
  public async getHashNonce(
    provider: Provider,
    user: string
  ): Promise<BigNumber> {
    return this.contract.connect(provider).getHashNonce(user);
  }

  // --- Increase nonce ---

  public async incrementHashNonce(maker: Signer): Promise<ContractTransaction> {
    const tx = this.incrementHashNonceTx(await maker.getAddress());
    return maker.sendTransaction(tx);
  }

  public incrementHashNonceTx(maker: string): TxData {
    const data: string = this.contract.interface.encodeFunctionData(
      "incrementHashNonce",
      []
    );
    return {
      from: maker,
      to: this.contract.address,
      data,
    };
  }

  public async getOrderHash(
    provider: Provider,
    order: Order
  ): Promise<BigNumber> {
    if (order.isBatchSignedOrder()) {
      return bn(order.hash());
    }

    const isSell = order.side() == "sell";
    if (order.contractKind() == "erc721") {
      if (isSell) {
        return this.contract
          .connect(provider)
          .getERC721SellOrderHash(order.getRaw());
      } else {
        return this.contract
          .connect(provider)
          .getERC721BuyOrderHash(order.getRaw());
      }
    } else {
      if (isSell) {
        return this.contract
          .connect(provider)
          .getERC1155SellOrderHash(order.getRaw());
      } else {
        return this.contract
          .connect(provider)
          .getERC1155BuyOrderHash(order.getRaw());
      }
    }
  }
}
