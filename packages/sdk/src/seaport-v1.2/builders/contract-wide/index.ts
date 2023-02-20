import { BigNumberish } from "@ethersproject/bignumber";
import { AddressZero } from "@ethersproject/constants";

import { BaseBuilder, BaseBuildParams, BaseOrderInfo } from "../base";
import { Order } from "../../order";
import * as Types from "../../types";
import { bn, s } from "../../../utils";

interface BuildParams extends BaseBuildParams {}

export class ContractWideBuilder extends BaseBuilder {
  constructor(chainId: number) {
    super(chainId);
  }

  public getInfo(order: Order): BaseOrderInfo | undefined {
    try {
      const { side, isDynamic } = this.getBaseInfo(order);

      const offerItem = order.params.offer[0];
      if (side === "buy") {
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
          item.itemType === Types.ItemType.ERC721 ||
          item.itemType === Types.ItemType.ERC721_WITH_CRITERIA
            ? "erc721"
            : "erc1155";
        const contract = item.token;
        const merkleRoot = item.identifierOrCriteria;
        const amount = item.startAmount;

        return {
          tokenKind,
          side,
          contract,
          merkleRoot,
          amount,
          paymentToken,
          price,
          fees,
          taker: AddressZero,
        };
      } else {
        throw new Error("Unsupported order side");
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
      if (!info?.merkleRoot) {
        return false;
      }

      const copyOrder = this.build({
        ...order.params,
        ...info,
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

    if (params.side === "buy") {
      return new Order(this.chainId, {
        kind: "contract-wide",
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
              2 +
              (params.tokenKind === "erc721"
                ? Types.ItemType.ERC721
                : Types.ItemType.ERC1155),
            token: params.contract,
            // No-op criteria
            identifierOrCriteria: "0",
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
    } else {
      throw new Error("Unsupported order side");
    }
  }

  public buildMatching(
    _order: Order,
    data: {
      tokenId: string;
      amount?: BigNumberish;
    }
  ) {
    return {
      amount: data?.amount ? s(data.amount) : undefined,
      criteriaResolvers: [
        {
          orderIndex: 0,
          side: Types.Side.CONSIDERATION,
          index: 0,
          identifier: data.tokenId,
          criteriaProof: [],
        },
      ],
    };
  }
}
