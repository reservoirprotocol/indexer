import { BaseBuilder, BaseOrderInfo } from "../base";
import { Order } from "../../order";
import * as Types from "../../types";
import { bn, lc, n, s } from "../../../utils";
import { BigNumber, constants } from "ethers/lib/ethers";
import { AssetClass } from "../../types";
import { ORDER_DATA_TYPES } from "../../constants";
import { buildOrderData } from "../utils";
import { getOrderSide } from "../../utils";
interface BuildParams extends Types.BaseBuildParams {
  tokenId: string;
}

export class SingleTokenBuilder extends BaseBuilder {
  public getInfo(order: Order): BaseOrderInfo {
    const side = getOrderSide(
      order.params.make.assetType.assetClass,
      order.params.take.assetType.assetClass
    );
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

  public build(params: BuildParams) {
    this.defaultInitialize(params);
    const nftInfo = {
      assetType: {
        assetClass: params.tokenKind.toUpperCase(),
        contract: lc(params.contract),
        tokenId: params.tokenId,
        ...(params.uri ? { uri: params.uri } : {}),
        ...(params.supply ? { supply: params.supply } : {}),
        ...(params.creators ? { creators: params.creators } : {}),
        ...(params.signatures ? { signatures: params.signatures } : {}),
        ...(params.royalties ? { royalties: params.royalties } : {}),
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
      kind: "single-token",
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
    data: { amount?: string }
  ) {
    const rightOrder = {
      type: order.type,
      maker: lc(taker),
      taker: order.maker,
      make: JSON.parse(JSON.stringify(order.take)),
      take: JSON.parse(JSON.stringify(order.make)),
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
      rightOrder.take.value = Math.floor(Number(data.amount || "1")).toString();
    }

    return rightOrder;
  }
}
