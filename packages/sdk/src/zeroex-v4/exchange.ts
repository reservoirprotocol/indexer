import { defaultAbiCoder } from "@ethersproject/abi";
import { Signer } from "@ethersproject/abstract-signer";
import { BigNumber } from "@ethersproject/bignumber";
import { Contract, ContractTransaction } from "@ethersproject/contracts";
import axios from "axios";

import * as Addresses from "./addresses";
import { Order } from "./order";
import * as Types from "./types";
import { BytesEmpty, TxData, bn, generateSourceBytes } from "../utils";

import ExchangeAbi from "./abis/Exchange.json";
import Erc721Abi from "../common/abis/Erc721.json";
import Erc1155Abi from "../common/abis/Erc1155.json";

export class Exchange {
  public chainId: number;
  public contract: Contract;
  public cbApiKey: string | undefined;

  constructor(chainId: number, cbApiKey?: string) {
    this.chainId = chainId;
    this.contract = new Contract(Addresses.Exchange[this.chainId], ExchangeAbi);
    this.cbApiKey = cbApiKey;
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
    const tx = await this.fillOrderTx(
      await taker.getAddress(),
      order,
      matchParams,
      options
    );
    return taker.sendTransaction(tx);
  }

  public async fillOrderTx(
    taker: string,
    order: Order,
    matchParams: Types.MatchParams,
    options?: {
      noDirectTransfer?: boolean;
      source?: string;
    }
  ): Promise<TxData> {
    const feeAmount = order.getFeeAmount();

    // If the order is a Coinbase NFT one, fetch the signature
    if (order.params.cbOrderId) {
      await this.releaseOrder(taker, order);
    }

    let to = this.contract.address;
    let data: string;
    let value: BigNumber | undefined;
    if (order.params.kind?.startsWith("erc721")) {
      const erc721 = new Contract(order.params.nft, Erc721Abi);
      if (order.params.direction === Types.TradeDirection.BUY) {
        if (options?.noDirectTransfer) {
          data = this.contract.interface.encodeFunctionData("sellERC721", [
            order.getRaw(),
            order.getRaw(),
            matchParams.nftId!,
            matchParams.unwrapNativeToken ?? true,
            BytesEmpty,
          ]);
        } else {
          to = erc721.address;
          data = erc721.interface.encodeFunctionData(
            "safeTransferFrom(address,address,uint256,bytes)",
            [
              taker,
              this.contract.address,
              matchParams.nftId!,
              defaultAbiCoder.encode(
                [Erc721OrderAbiType, SignatureAbiType, "bool"],
                [
                  order.getRaw(),
                  order.getRaw(),
                  matchParams.unwrapNativeToken ?? true,
                ]
              ),
            ]
          );
        }
      } else {
        data = this.contract.interface.encodeFunctionData("buyERC721", [
          order.getRaw(),
          order.getRaw(),
          BytesEmpty,
        ]);
        value = bn(order.params.erc20TokenAmount).add(feeAmount);
      }
    } else {
      const erc1155 = new Contract(order.params.nft, Erc1155Abi);
      if (order.params.direction === Types.TradeDirection.BUY) {
        if (options?.noDirectTransfer) {
          data = this.contract.interface.encodeFunctionData("sellERC1155", [
            order.getRaw(),
            order.getRaw(),
            matchParams.nftId!,
            matchParams.nftAmount!,
            matchParams.unwrapNativeToken ?? true,
            BytesEmpty,
          ]);
        } else {
          to = erc1155.address;
          data = erc1155.interface.encodeFunctionData("safeTransferFrom", [
            taker,
            this.contract.address,
            matchParams.nftId!,
            matchParams.nftAmount!,
            defaultAbiCoder.encode(
              [Erc1155OrderAbiType, SignatureAbiType, "bool"],
              [
                order.getRaw(),
                order.getRaw(),
                matchParams.unwrapNativeToken ?? false,
              ]
            ),
          ]);
        }
      } else {
        data = this.contract.interface.encodeFunctionData("buyERC1155", [
          order.getRaw(),
          order.getRaw(),
          matchParams.nftAmount!,
          BytesEmpty,
        ]);
        value = bn(matchParams.nftAmount!)
          .mul(order.params.erc20TokenAmount)
          .add(order.params.nftAmount!)
          .sub(1)
          .div(order.params.nftAmount!)
          // Buyer pays the fees
          .add(
            feeAmount.mul(matchParams.nftAmount!).div(order.params.nftAmount!)
          );
      }
    }

    return {
      from: taker,
      to,
      data: data + generateSourceBytes(options?.source),
      value: value && bn(value).toHexString(),
    };
  }

  // --- Batch fill listings ---

  public async batchBuy(
    taker: Signer,
    orders: Order[],
    matchParams: Types.MatchParams[],
    options?: {
      source?: string;
    }
  ): Promise<ContractTransaction> {
    const tx = await this.batchBuyTx(
      await taker.getAddress(),
      orders,
      matchParams,
      options
    );
    return taker.sendTransaction(tx);
  }

  public async batchBuyTx(
    taker: string,
    orders: Order[],
    matchParams: Types.MatchParams[],
    options?: {
      source?: string;
    }
  ): Promise<TxData> {
    const sellOrders: any[] = [];
    const signatures: any[] = [];
    const fillAmounts: string[] = [];
    const callbackData: string[] = [];

    for (const order of orders) {
      // If the order is a Coinbase NFT one, fetch the signature
      if (order.params.cbOrderId) {
        await this.releaseOrder(taker, order);
      }
    }

    const tokenKind = orders[0].params.kind?.split("-")[0];
    if (!tokenKind) {
      throw new Error("Could not detect token kind");
    }

    let value = bn(0);
    for (let i = 0; i < Math.min(orders.length, matchParams.length); i++) {
      if (orders[i].params.direction !== Types.TradeDirection.SELL) {
        throw new Error("Invalid side");
      }
      if (orders[i].params.kind?.split("-")[0] !== tokenKind) {
        throw new Error("Invalid kind");
      }

      const feeAmount = orders[i].getFeeAmount();
      value = value.add(
        bn(matchParams[i].nftAmount!)
          .mul(orders[i].params.erc20TokenAmount)
          .add(orders[i].params.nftAmount!)
          .sub(1)
          .div(orders[i].params.nftAmount!)
          // Buyer pays the fees
          .add(
            feeAmount
              .mul(matchParams[i].nftAmount!)
              .div(orders[i].params.nftAmount!)
          )
      );

      sellOrders.push(orders[i].getRaw());
      signatures.push(orders[i].getRaw());
      fillAmounts.push(matchParams[i].nftAmount!);
      callbackData.push(BytesEmpty);
    }

    return {
      from: taker,
      to: this.contract.address,
      data:
        (tokenKind === "erc1155"
          ? this.contract.interface.encodeFunctionData("batchBuyERC1155s", [
              sellOrders,
              signatures,
              fillAmounts,
              callbackData,
              false,
            ])
          : this.contract.interface.encodeFunctionData("batchBuyERC721s", [
              sellOrders,
              signatures,
              callbackData,
              false,
            ])) + generateSourceBytes(options?.source),
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
    if (order.params.kind?.startsWith("erc721")) {
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

  // --- Release order ---

  public async releaseOrder(taker: string, order: Order) {
    const response = await axios.post(
      "https://nft-api.coinbase.com/api/nft/marketplaceorderbook/v1/releaseorder",
      {
        order_id: order.params.cbOrderId,
        wallet_address: taker,
        ip_address: "127.0.0.1",
      },
      {
        headers: {
          "Content-Type": "application/json",
          "Cb-Nft-Api-Token": this.cbApiKey!,
        },
      }
    );

    const signature = response.data.listing.signatureV4;
    order.params.signatureType = 2;
    order.params.v = signature.v;
    order.params.r = signature.r;
    order.params.s = signature.s;
  }
}

const Erc721OrderAbiType = `(
  uint8 direction,
  address maker,
  address taker,
  uint256 expiry,
  uint256 nonce,
  address erc20Token,
  uint256 erc20TokenAmount,
  (address recipient, uint256 amount, bytes feeData)[] fees,
  address erc721Token,
  uint256 erc721TokenId,
  (address propertyValidator, bytes propertyData)[] erc721TokenProperties
)`;

const Erc1155OrderAbiType = `(
  uint8 direction,
  address maker,
  address taker,
  uint256 expiry,
  uint256 nonce,
  address erc20Token,
  uint256 erc20TokenAmount,
  (address recipient, uint256 amount, bytes feeData)[] fees,
  address erc1155Token,
  uint256 erc1155TokenId,
  (address propertyValidator, bytes propertyData)[] erc1155TokenProperties,
  uint128 erc1155TokenAmount
)`;

const SignatureAbiType = `(
  uint8 signatureType,
  uint8 v,
  bytes32 r,
  bytes32 s
)`;
