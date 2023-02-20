import { BigNumberish } from "@ethersproject/bignumber";
import { AddressZero } from "@ethersproject/constants";

import { BaseBuildParams, BaseBuilder, BaseOrderInfo } from "../base";
import { Order } from "../../order";
import * as Types from "../../types";
import { bn, s } from "../../../utils";

interface BuildParams extends BaseBuildParams {
  tokenId: BigNumberish;
}

export class SingleTokenBuilder extends BaseBuilder {
  public getInfo(order: Order): BaseOrderInfo | undefined {
    try {
      const { side, isDynamic } = this.getBaseInfo(order);

      let taker = AddressZero;

      const offerItem = order.params.offer[0];
      if (side === "sell") {
        // The offer item is the sold token
        const tokenKind =
          offerItem.itemType === Types.ItemType.ERC721 ? "erc721" : "erc1155";
        const contract = offerItem.token;
        const tokenId = offerItem.identifierOrCriteria;
        const amount = offerItem.startAmount;

        // Ensure all consideration items match (with the exception of the
        // last one which can match the offer item if the listing is meant
        // to be fillable only by a specific taker - eg. private)
        const fees: {
          recipient: string;
          amount: BigNumberish;
          endAmount?: BigNumberish;
        }[] = [];

        const c = order.params.consideration;

        const paymentToken = c[0].token;
        const price = bn(c[0].startAmount);
        const endPrice = bn(c[0].endAmount);
        for (let i = 1; i < c.length; i++) {
          // Seaport private listings have the last consideration item match the offer item
          if (
            i === c.length - 1 &&
            c[i].token === offerItem.token &&
            c[i].identifierOrCriteria === offerItem.identifierOrCriteria
          ) {
            taker = c[i].recipient;
          } else if (c[i].token !== paymentToken) {
            throw new Error("Invalid consideration");
          } else {
            fees.push({
              recipient: c[i].recipient,
              amount: c[i].startAmount,
              endAmount: c[i].endAmount,
            });
          }
        }

        return {
          tokenKind,
          side,
          contract,
          tokenId,
          amount,
          paymentToken,
          price: s(price),
          endPrice: s(endPrice),
          fees,
          isDynamic,
          taker,
        };
      } else {
        if (isDynamic) {
          throw new Error("Reverse dutch auctions are not supported");
        }

        const paymentToken = offerItem.token;
        const price = offerItem.startAmount;

        // The first consideration item is the bought token
        const item = order.params.consideration[0];

        // The other items in the consideration are the fees
        const fees: {
          recipient: string;
          amount: BigNumberish;
        }[] = [];
        for (let i = 1; i < order.params.consideration.length; i++) {
          const consideration = order.params.consideration[i];
          if (i > 1 && consideration.token !== paymentToken) {
            throw new Error("Invalid consideration");
          }
          fees.push({
            recipient: consideration.recipient,
            amount: consideration.startAmount,
          });
        }

        const tokenKind =
          item.itemType === Types.ItemType.ERC721 ? "erc721" : "erc1155";
        const contract = item.token;
        const tokenId = item.identifierOrCriteria;
        const amount = item.startAmount;

        return {
          tokenKind,
          side,
          contract,
          tokenId,
          amount,
          paymentToken,
          price,
          fees,
          taker,
        };
      }
    } catch {
      return undefined;
    }
  }

  public isValid(order: Order): boolean {
    try {
      if (!this.baseIsValid(order)) {
        return false;
      }

      const info = this.getInfo(order);
      if (!info?.tokenId) {
        return false;
      }

      const copyOrder = this.build({
        ...order.params,
        ...info,
      } as any);

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

    if (params.side === "sell") {
      return new Order(this.chainId, {
        kind: "single-token",
        offerer: params.offerer,
        zone: params.zone!,
        offer: [
          {
            itemType:
              params.tokenKind === "erc721"
                ? Types.ItemType.ERC721
                : Types.ItemType.ERC1155,
            token: params.contract,
            identifierOrCriteria: s(params.tokenId),
            startAmount: s(
              params.tokenKind === "erc1155" ? params.amount ?? 1 : 1
            ),
            endAmount: s(
              params.tokenKind === "erc1155" ? params.amount ?? 1 : 1
            ),
          },
        ],
        consideration: [
          {
            itemType:
              params.paymentToken === AddressZero
                ? Types.ItemType.NATIVE
                : Types.ItemType.ERC20,
            token: params.paymentToken,
            identifierOrCriteria: "0",
            startAmount: s(params.price),
            endAmount: s(params.endPrice ?? params.price),
            recipient: params.offerer,
          },
          ...(params.fees || []).map(({ amount, endAmount, recipient }) => ({
            itemType:
              params.paymentToken === AddressZero
                ? Types.ItemType.NATIVE
                : Types.ItemType.ERC20,
            token: params.paymentToken,
            identifierOrCriteria: "0",
            startAmount: s(amount),
            endAmount: s(endAmount ?? amount),
            recipient,
          })),
          ...(params.taker && params.taker !== AddressZero
            ? [
                {
                  itemType:
                    params.tokenKind === "erc721"
                      ? Types.ItemType.ERC721
                      : Types.ItemType.ERC1155,
                  token: params.contract,
                  identifierOrCriteria: s(params.tokenId),
                  startAmount: s(
                    params.tokenKind === "erc1155" ? params.amount ?? 1 : 1
                  ),
                  endAmount: s(
                    params.tokenKind === "erc1155" ? params.amount ?? 1 : 1
                  ),
                  recipient: params.taker,
                },
              ]
            : []),
        ],
        orderType:
          params.orderType !== undefined
            ? params.orderType
            : (params.zone === AddressZero ? 0 : 2) +
              (params.tokenKind === "erc1155" || bn(params.amount ?? 1).gt(1)
                ? Types.OrderType.PARTIAL_OPEN
                : Types.OrderType.FULL_OPEN),
        startTime: params.startTime!,
        endTime: params.endTime!,
        zoneHash: params.zoneHash!,
        salt: s(params.salt!),
        conduitKey: params.conduitKey!,
        counter: s(params.counter),
        signature: params.signature,
      });
    } else {
      if (params.taker && params.taker !== AddressZero) {
        throw new Error("Private bids are not yet supported");
      }

      return new Order(this.chainId, {
        kind: "single-token",
        offerer: params.offerer,
        zone: params.zone!,
        offer: [
          {
            itemType: Types.ItemType.ERC20,
            token: params.paymentToken,
            identifierOrCriteria: "0",
            startAmount: s(params.price),
            endAmount: s(params.price),
          },
        ],
        consideration: [
          {
            itemType:
              params.tokenKind === "erc721"
                ? Types.ItemType.ERC721
                : Types.ItemType.ERC1155,
            token: params.contract,
            identifierOrCriteria: s(params.tokenId),
            startAmount: s(params.amount ?? 1),
            endAmount: s(params.amount ?? 1),
            recipient: params.offerer,
          },
          ...(params.fees || []).map(({ amount, recipient }) => ({
            itemType: Types.ItemType.ERC20,
            token: params.paymentToken,
            identifierOrCriteria: "0",
            startAmount: s(amount),
            endAmount: s(amount),
            recipient,
          })),
        ],
        orderType:
          params.orderType !== undefined
            ? params.orderType
            : (params.zone === AddressZero ? 0 : 2) +
              (params.tokenKind === "erc1155" || bn(params.amount ?? 1).gt(1)
                ? Types.OrderType.PARTIAL_OPEN
                : Types.OrderType.FULL_OPEN),
        startTime: params.startTime!,
        endTime: params.endTime!,
        zoneHash: params.zoneHash!,
        salt: s(params.salt!),
        conduitKey: params.conduitKey!,
        counter: s(params.counter),
        signature: params.signature,
      });
    }
  }

  public buildMatching(_order: Order, data?: { amount?: BigNumberish }) {
    return {
      amount: data?.amount ? s(data.amount) : undefined,
    };
  }
}
