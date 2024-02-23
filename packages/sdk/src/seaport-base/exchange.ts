import { Provider, TransactionResponse } from "@ethersproject/abstract-provider";
import { Signer } from "@ethersproject/abstract-signer";
import { BigNumberish } from "@ethersproject/bignumber";
import { AddressZero, HashZero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";

import { BaseOrderInfo } from "./builders/base";
import { IOrder } from "./order";
import * as Types from "./types";
import * as CommonAddresses from "../common/addresses";
import { TxData, bn, generateSourceBytes, lc, n, s } from "../utils";

import { ConduitController } from "../seaport-base";

export abstract class SeaportBaseExchange {
  public chainId: number;
  public abstract contract: Contract;
  public conduitController: ConduitController;

  constructor(chainId: number) {
    this.chainId = chainId;

    this.conduitController = new ConduitController(this.chainId);
  }

  public abstract deriveConduit(conduitKey: string): string;

  public abstract eip712Domain(): {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: string;
  };

  // --- Fill order ---

  public async fillOrder(
    taker: Signer,
    order: IOrder,
    matchParams: Types.MatchParams,
    options?: {
      recipient?: string;
      conduitKey?: string;
      feesOnTop?: {
        amount: string;
        recipient: BigNumberish;
      }[];
      source?: string;
      timestampOverride?: number;
    }
  ): Promise<TransactionResponse> {
    const tx = await this.fillOrderTx(await taker.getAddress(), order, matchParams, options);
    return taker.sendTransaction(tx);
  }

  public async fillOrderTx(
    taker: string,
    order: IOrder,
    matchParams: Types.MatchParams,
    options?: {
      recipient?: string;
      conduitKey?: string;
      feesOnTop?: {
        amount: string;
        recipient: BigNumberish;
      }[];
      timestampOverride?: number;
      source?: string;
    }
  ): Promise<TxData> {
    const recipient = options?.recipient ?? AddressZero;
    const conduitKey = options?.conduitKey ?? HashZero;
    const feesOnTop = options?.feesOnTop ?? [];

    let info = order.getInfo();
    if (!info) {
      throw new Error("Could not get order info");
    }

    if (info.side === "sell") {
      if (order.isPrivateOrder()) {
        info = info as BaseOrderInfo;
        const counterOrder = order.constructPrivateListingCounterOrder(taker);
        const fulfillments = order.getPrivateListingFulfillments();

        const advancedOrder = {
          parameters: {
            ...order.params,
            totalOriginalConsiderationItems: order.params.consideration.length,
          },
          signature: order.params.signature,
          numerator: matchParams.amount ?? 1,
          denominator: info.amount,
          extraData: matchParams.extraData ?? order.params.extraData ?? "0x",
        };

        return {
          from: taker,
          to: this.contract.address,
          data:
            this.contract.interface.encodeFunctionData("matchAdvancedOrders", [
              [
                advancedOrder,
                {
                  ...counterOrder,
                  numerator: matchParams.amount ?? 1,
                  denominator: info.amount,
                  extraData: "0x",
                },
              ],
              [],
              fulfillments,
              taker,
            ]) + generateSourceBytes(options?.source),
          value:
            info.paymentToken === CommonAddresses.Native[this.chainId]
              ? bn(order.getMatchingPrice(options?.timestampOverride))
                  .mul(matchParams.amount || "1")
                  .div(info.amount)
                  .toHexString()
              : undefined,
        };
      }

      if (
        // The recipient is the taker
        (recipient === AddressZero || recipient === taker) &&
        // Order is single quantity
        info.amount === "1" &&
        // Order has no criteria
        !matchParams.criteriaResolvers &&
        // Order requires no extra data
        !this.requiresExtraData(order)
      ) {
        info = info as BaseOrderInfo;

        // Use "basic" fulfillment
        return {
          from: taker,
          to: this.contract.address,
          data:
            this.contract.interface.encodeFunctionData("fulfillBasicOrder_efficient_6GL6yc", [
              {
                considerationToken: info.paymentToken,
                considerationIdentifier: "0",
                considerationAmount: info.price,
                offerer: order.params.offerer,
                zone: order.params.zone,
                offerToken: info.contract,
                offerIdentifier: info.tokenId,
                offerAmount: info.amount,
                basicOrderType:
                  (info.tokenKind === "erc721"
                    ? info.paymentToken === CommonAddresses.Native[this.chainId]
                      ? Types.BasicOrderType.ETH_TO_ERC721_FULL_OPEN
                      : Types.BasicOrderType.ERC20_TO_ERC721_FULL_OPEN
                    : info.paymentToken === CommonAddresses.Native[this.chainId]
                    ? Types.BasicOrderType.ETH_TO_ERC1155_FULL_OPEN
                    : Types.BasicOrderType.ERC20_TO_ERC1155_FULL_OPEN) + order.params.orderType,
                startTime: order.params.startTime,
                endTime: order.params.endTime,
                zoneHash: order.params.zoneHash,
                salt: order.params.salt,
                offererConduitKey: order.params.conduitKey,
                fulfillerConduitKey: conduitKey,
                totalOriginalAdditionalRecipients: order.params.consideration.length - 1,
                additionalRecipients: [
                  ...order.params.consideration.slice(1).map(({ startAmount, recipient }) => ({
                    amount: startAmount,
                    recipient,
                  })),
                  ...feesOnTop,
                ],
                signature: order.params.signature!,
              },
            ]) + generateSourceBytes(options?.source),
          value:
            info.paymentToken === CommonAddresses.Native[this.chainId]
              ? bn(order.getMatchingPrice(options?.timestampOverride))
                  .mul(matchParams.amount || "1")
                  .div(info.amount)
                  .toHexString()
              : undefined,
        };
      } else {
        // Use "advanced" fullfillment
        return {
          from: taker,
          to: this.contract.address,
          data:
            this.contract.interface.encodeFunctionData("fulfillAdvancedOrder", [
              {
                parameters: {
                  ...order.params,
                  totalOriginalConsiderationItems: order.params.consideration.length,
                },
                numerator: matchParams.amount || "1",
                denominator: info.amount,
                signature: order.params.signature!,
                extraData: await this.getExtraData(order, matchParams),
              },
              matchParams.criteriaResolvers || [],
              conduitKey,
              recipient,
            ]) + generateSourceBytes(options?.source),
          value:
            info.paymentToken === CommonAddresses.Native[this.chainId]
              ? bn(order.getMatchingPrice(options?.timestampOverride))
                  .mul(matchParams.amount || "1")
                  .div(info.amount)
                  .toHexString()
              : undefined,
        };
      }
    } else {
      if (
        // The recipient is the taker
        (recipient === AddressZero || recipient === taker) &&
        // Order is single quantity
        info.amount === "1" &&
        // Order has no criteria
        !matchParams.criteriaResolvers &&
        // Order requires no extra data
        !this.requiresExtraData(order) &&
        !info.isDynamic
      ) {
        info = info as BaseOrderInfo;
        // Use "basic" fulfillment
        return {
          from: taker,
          to: this.contract.address,
          data:
            this.contract.interface.encodeFunctionData("fulfillBasicOrder", [
              {
                considerationToken: info.contract,
                considerationIdentifier: info.tokenId,
                considerationAmount: info.amount,
                offerer: order.params.offerer,
                zone: order.params.zone,
                offerToken: info.paymentToken,
                offerIdentifier: "0",
                offerAmount: info.price,
                basicOrderType:
                  (info.tokenKind === "erc721"
                    ? Types.BasicOrderType.ERC721_TO_ERC20_FULL_OPEN
                    : Types.BasicOrderType.ERC1155_TO_ERC20_FULL_OPEN) + order.params.orderType,
                startTime: order.params.startTime,
                endTime: order.params.endTime,
                zoneHash: order.params.zoneHash,
                salt: order.params.salt,
                offererConduitKey: order.params.conduitKey,
                fulfillerConduitKey: conduitKey,
                totalOriginalAdditionalRecipients: order.params.consideration.length - 1,
                additionalRecipients: [
                  ...order.params.consideration.slice(1).map(({ startAmount, recipient }) => ({
                    amount: startAmount,
                    recipient,
                  })),
                  ...feesOnTop,
                ],
                signature: order.params.signature!,
              },
            ]) + generateSourceBytes(options?.source),
        };
      } else {
        // Use "advanced" fulfillment
        return {
          from: taker,
          to: this.contract.address,
          data:
            this.contract.interface.encodeFunctionData("fulfillAdvancedOrder", [
              {
                parameters: {
                  ...order.params,
                  totalOriginalConsiderationItems: order.params.consideration.length,
                },
                numerator: matchParams.amount || "1",
                denominator: info.amount,
                signature: order.params.signature!,
                extraData: await this.getExtraData(order, matchParams),
              },
              matchParams.criteriaResolvers || [],
              conduitKey,
              recipient,
            ]) + generateSourceBytes(options?.source),
        };
      }
    }
  }

  // --- Batch fill orders ---

  public async fillOrders(
    taker: Signer,
    orders: IOrder[],
    matchParams: Types.MatchParams[],
    options?: {
      recipient?: string;
      conduitKey?: string;
      source?: string;
      maxOrdersToFulfill?: number;
      timestampOverride?: number;
    }
  ): Promise<TransactionResponse> {
    const tx = await this.fillOrdersTx(await taker.getAddress(), orders, matchParams, options);
    return taker.sendTransaction(tx);
  }

  public async fillOrdersTx(
    taker: string,
    orders: IOrder[],
    matchParams: Types.MatchParams[],
    options?: {
      recipient?: string;
      conduitKey?: string;
      source?: string;
      maxOrdersToFulfill?: number;
      timestampOverride?: number;
    }
  ): Promise<TxData> {
    const recipient = options?.recipient ?? AddressZero;
    const conduitKey = options?.conduitKey ?? HashZero;

    return {
      from: taker,
      to: this.contract.address,
      data:
        this.contract.interface.encodeFunctionData("fulfillAvailableAdvancedOrders", [
          await Promise.all(
            orders.map(async (order, i) => ({
              parameters: {
                ...order.params,
                totalOriginalConsiderationItems: order.params.consideration.length,
              },
              numerator: matchParams[i].amount || "1",
              denominator: order.getInfo()!.amount,
              signature: order.params.signature!,
              extraData: await this.getExtraData(order, matchParams[i]),
            }))
          ),
          matchParams
            .map((m, i) =>
              (m.criteriaResolvers ?? []).map((resolver) => ({
                ...resolver,
                orderIndex: i,
              }))
            )
            .flat(),
          // TODO: Optimize fulfillment components
          orders
            .map((order, i) =>
              order.params.offer.map((_, j) => ({
                orderIndex: i,
                itemIndex: j,
              }))
            )
            .flat()
            .map((x) => [x]),
          orders
            .map((order, i) =>
              order.params.consideration.map((_, j) => ({
                orderIndex: i,
                itemIndex: j,
              }))
            )
            .flat()
            .map((x) => [x]),
          conduitKey,
          recipient,
          options?.maxOrdersToFulfill ?? 255,
        ]) + generateSourceBytes(options?.source),
      value: bn(
        orders
          .filter((order) => {
            const info = order.getInfo();
            return (
              info &&
              info.side === "sell" &&
              info.paymentToken === CommonAddresses.Native[this.chainId]
            );
          })
          .map((order, i) =>
            bn(order.getMatchingPrice(options?.timestampOverride))
              .mul(matchParams[i].amount || "1")
              .div(order.getInfo()!.amount)
          )
          .reduce((a, b) => bn(a).add(b), bn(0))
      ).toHexString(),
    };
  }

  // --- Cancel order ---

  public async cancelOrder(maker: Signer, order: IOrder): Promise<TransactionResponse> {
    const tx = this.cancelOrderTx(await maker.getAddress(), order);
    return maker.sendTransaction(tx);
  }

  public cancelOrderTx(maker: string, order: IOrder): TxData {
    return {
      from: maker,
      to: this.contract.address,
      data: this.contract.interface.encodeFunctionData("cancel", [[order.params]]),
    };
  }

  public async cancelOrders(maker: Signer, orders: IOrder[]): Promise<TransactionResponse> {
    const tx = this.cancelOrdersTx(await maker.getAddress(), orders);
    return maker.sendTransaction(tx);
  }

  public cancelOrdersTx(maker: string, orders: IOrder[]): TxData {
    return {
      from: maker,
      to: this.contract.address,
      data: this.contract.interface.encodeFunctionData("cancel", [
        orders.map((order) => order.params),
      ]),
    };
  }

  public async cancelAllOrders(maker: Signer): Promise<TransactionResponse> {
    const tx = this.cancelAllOrdersTx(await maker.getAddress());
    return maker.sendTransaction(tx);
  }

  public cancelAllOrdersTx(maker: string): TxData {
    return {
      from: maker,
      to: this.contract.address,
      data: this.contract.interface.encodeFunctionData("incrementCounter", []),
    };
  }

  // --- Get counter (eg. nonce) ---

  public async getCounter(provider: Provider, user: string): Promise<BigNumberish> {
    return this.contract.connect(provider).getCounter(user);
  }

  // --- Derive basic sale information ---

  public deriveBasicSale(spentItems: Types.SpentItem[], receivedItems: Types.ReceivedItem[]) {
    // Normalize
    const nSpentItems: Types.SpentItem[] = [];
    for (const spentItem of spentItems) {
      nSpentItems.push({
        itemType: n(spentItem.itemType),
        token: lc(spentItem.token),
        identifier: s(spentItem.identifier),
        amount: s(spentItem.amount),
      });
    }
    const nReceivedItems: Types.ReceivedItem[] = [];
    for (const receivedItem of receivedItems) {
      nReceivedItems.push({
        itemType: n(receivedItem.itemType),
        token: lc(receivedItem.token),
        identifier: s(receivedItem.identifier),
        amount: s(receivedItem.amount),
        recipient: lc(receivedItem.recipient),
      });
    }

    try {
      if (nSpentItems.length === 1) {
        if (nSpentItems[0].itemType >= 2) {
          // Listing got filled

          const mainConsideration = nReceivedItems[0];
          if (mainConsideration.itemType >= 2) {
            throw new Error("Not a basic sale");
          }

          // Keep track of any "false" consideration items and remove them from price computation
          const falseReceivedItemsIndexes: number[] = [];
          let recipientOverride: string | undefined;
          for (let i = 1; i < nReceivedItems.length; i++) {
            if (
              nReceivedItems[i].itemType == nSpentItems[0].itemType &&
              nReceivedItems[i].token == nSpentItems[0].token &&
              nReceivedItems[i].identifier == nSpentItems[0].identifier
            ) {
              recipientOverride = nReceivedItems[i].recipient;
              falseReceivedItemsIndexes.push(i);
            } else if (
              nReceivedItems[i].itemType !== mainConsideration.itemType ||
              nReceivedItems[i].token !== mainConsideration.token
            ) {
              throw new Error("Not a basic sale");
            }
          }

          return {
            // To cover the generic `matchOrders` case
            recipientOverride:
              recipientOverride && recipientOverride !== AddressZero
                ? recipientOverride
                : undefined,
            contract: nSpentItems[0].token,
            tokenId: nSpentItems[0].identifier,
            amount: nSpentItems[0].amount,
            paymentToken: mainConsideration.token,
            price: nReceivedItems
              .filter((_, i) => !falseReceivedItemsIndexes.includes(i))
              .map((c) => bn(c.amount))
              .reduce((a, b) => a.add(b))
              .toString(),
            side: "sell",
          };
        } else {
          // Bid got filled

          const mainConsideration = nReceivedItems[0];
          if (mainConsideration.itemType < 2) {
            throw new Error("Not a basic sale");
          }

          for (let i = 1; i < nReceivedItems.length; i++) {
            if (
              nReceivedItems[i].itemType !== nSpentItems[0].itemType ||
              nReceivedItems[i].token !== nSpentItems[0].token
            ) {
              throw new Error("Not a basic sale");
            }
          }

          return {
            recipientOverride: undefined,
            contract: mainConsideration.token,
            tokenId: mainConsideration.identifier,
            amount: mainConsideration.amount,
            paymentToken: nSpentItems[0].token,
            price: nSpentItems[0].amount,
            side: "buy",
          };
        }
      }
    } catch {
      return undefined;
    }
  }

  protected abstract requiresExtraData(order: IOrder): boolean;

  protected abstract getExtraData(order: IOrder, matchParams?: Types.MatchParams): Promise<string>;
}
