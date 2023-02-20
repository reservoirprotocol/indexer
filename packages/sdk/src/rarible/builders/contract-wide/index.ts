import { BaseBuilder, BaseOrderInfo } from "../base";
import { Order } from "../../order";
import * as Types from "../../types";
import { lc, n, s } from "../../../utils";
import { BigNumber, constants } from "ethers/lib/ethers";
import { AssetClass } from "../../types";
import { ORDER_DATA_TYPES } from "../../constants";
import { buildOrderData } from "../utils";

export class ContractWideBuilder extends BaseBuilder {
  public getInfo(order: Order): BaseOrderInfo {
    let side: "sell" | "buy";
    const makeAssetClass = order.params.make.assetType.assetClass;
    const takeAssetClass = order.params.take.assetType.assetClass;
    if (
      (makeAssetClass === Types.AssetClass.ERC721 ||
        makeAssetClass === Types.AssetClass.ERC1155) &&
      (takeAssetClass === Types.AssetClass.ERC20 ||
        takeAssetClass === Types.AssetClass.ETH)
    ) {
      side = "sell";
    } else if (
      makeAssetClass === Types.AssetClass.ERC20 &&
      (takeAssetClass === Types.AssetClass.ERC721 ||
        takeAssetClass === Types.AssetClass.ERC1155 ||
        takeAssetClass === Types.AssetClass.COLLECTION)
    ) {
      side = "buy";
    } else {
      throw new Error("Invalid asset class");
    }
    return {
      side,
    };
  }

  public isValid(order: Order): boolean {
    //TODO: Add more validations (used by indexer)
    const { side } = this.getInfo(order);
    try {
      const nftInfo = side === "buy" ? order.params.take : order.params.make;
      const paymentInfo =
        side === "buy" ? order.params.make : order.params.take;

      let dataType = order.params.data.dataType;
      let data = JSON.parse(JSON.stringify(order.params.data));

      if (!Array.isArray(data.payouts)) {
        data.payouts = [data.payouts];
      }

      const copyOrder = this.build({
        ...order.params,
        ...data,
        dataType,
        side,
        maker: order.params.maker,
        tokenKind: nftInfo.assetType.assetClass,
        contract: lc(nftInfo.assetType.contract!),
        tokenId: nftInfo.assetType.tokenId!,
        price: paymentInfo.value,
        paymentToken:
          paymentInfo.assetType.assetClass === AssetClass.ETH
            ? constants.AddressZero
            : lc(paymentInfo.assetType.contract!),
        tokenAmount: n(nftInfo.value),
        uri: nftInfo.assetType.uri,
        supply: nftInfo.assetType.supply,
        royalties: nftInfo.assetType.royalties,
        signatures: nftInfo.assetType.signatures,
        creators: nftInfo.assetType.creators,
      });

      if (!copyOrder) {
        return false;
      }

      if (copyOrder.hashOrderKey() !== order.hashOrderKey()) {
        return false;
      }
    } catch {
      return false;
    }

    return true;
  }

  public build(params: Types.BaseBuildParams) {
    this.defaultInitialize(params);
    const nftInfo = {
      assetType: {
        assetClass: Types.AssetClass.COLLECTION,
        contract: lc(params.contract),
      },
      value: s(params.tokenAmount || 1),
    };

    const paymentInfo = {
      assetType: {
        ...(params.paymentToken && params.paymentToken !== constants.AddressZero
          ? {
              assetClass: AssetClass.ERC20,
              contract: lc(params.paymentToken),
            }
          : {
              assetClass: AssetClass.ETH,
            }),
      },
      value: params.price,
    };

    return new Order(this.chainId, {
      side: params.side,
      kind: "contract-wide",
      type: params.orderType,
      maker: params.maker,
      make: params.side === "buy" ? paymentInfo : nftInfo,
      taker: constants.AddressZero,
      take: params.side === "buy" ? nftInfo : paymentInfo,
      salt: s(params.salt),
      start: params.startTime,
      end: params.endTime!,
      data: buildOrderData(params),
    });
  }

  public buildMatching(
    order: Types.Order,
    taker: string,
    data: { tokenId: string; assetClass: "ERC721" | "ERC1155"; amount?: string }
  ) {
    let make,
      take = null;
    if (order.side === "buy") {
      take = JSON.parse(JSON.stringify(order.make));
      make = {
        assetType: {
          assetClass: data.assetClass,
          contract: order.take.assetType.contract,
          tokenId: data.tokenId,
        },
        value: order.take.value,
      };
    } else {
      throw Error("Unknown side");
    }

    const rightOrder = {
      type: order.type,
      maker: lc(taker),
      taker: order.maker,
      make,
      take,
      salt: 0,
      start: order.start,
      end: order.end,
      data: JSON.parse(JSON.stringify(order.data)),
    };

    if (order.data.dataType === ORDER_DATA_TYPES.V2) {
      rightOrder.data.payouts = null;
      rightOrder.data.originFees = null;
    }

    // `V3` orders can only be matched if buy-order is `V3_BUY` and the sell-order is `V3_SELL`
    if (order.data.dataType === ORDER_DATA_TYPES.V3_SELL) {
      rightOrder.data.dataType = ORDER_DATA_TYPES.V3_BUY;
      rightOrder.data.originFeeFirst = null;
      rightOrder.data.originFeeSecond = null;
      rightOrder.data.maxFeesBasePoint = null;
      rightOrder.data.payouts = null;
    } else if (order.data.dataType === ORDER_DATA_TYPES.V3_BUY) {
      rightOrder.data.dataType = ORDER_DATA_TYPES.V3_SELL;
      rightOrder.data.originFeeFirst = null;
      rightOrder.data.originFeeSecond = null;
      rightOrder.data.payouts = null;
    }

    // for erc1155 we need to take the value from request (the amount parameter)
    if (AssetClass.ERC1155 == order.make.assetType.assetClass) {
      rightOrder.take.value = Math.floor(Number(data.amount)).toString();
    }

    if (AssetClass.ERC1155 == order.take.assetType.assetClass) {
      const oldValue = rightOrder.make.value as any;

      rightOrder.make.value = Math.floor(Number(data.amount)).toString();
      rightOrder.take.value = BigNumber.from(rightOrder.take.value)
        .div(oldValue - (rightOrder.make.value as any) || "1")
        .toString();
    }
    return rightOrder;
  }
}
