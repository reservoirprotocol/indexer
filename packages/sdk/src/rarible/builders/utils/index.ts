import { Types } from "../..";
import { ORDER_DATA_TYPES } from "../../constants";

export const buildOrderData = (
  params: Types.BaseBuildParams
):
  | Types.ILegacyOrderData
  | Types.IV1OrderData
  | Types.IV2OrderData
  | Types.IV3OrderSellData
  | Types.IV3OrderBuyData => {
  switch (params.dataType) {
    // Can't find info about Legacy type in the contract but it's found in V1 orders that Rarible's API returns
    case ORDER_DATA_TYPES.LEGACY:
      const legacyData: Types.ILegacyOrderData = {
        dataType: ORDER_DATA_TYPES.LEGACY,
        fee: params.fee!,
      };
      return legacyData;
    case ORDER_DATA_TYPES.V1:
      const v1Data: Types.IV1OrderData = {
        dataType: ORDER_DATA_TYPES.V1,
        payouts: params.payouts!,
        originFees: params.originFees!,
      };
      return v1Data;
    case ORDER_DATA_TYPES.V2:
      const v2Data: Types.IV2OrderData = {
        dataType: ORDER_DATA_TYPES.V2,
        payouts: params.payouts!,
        originFees: params.originFees!,
      };
      return v2Data;
    case ORDER_DATA_TYPES.V3_SELL:
      const v3SellData: Types.IV3OrderSellData = {
        dataType: ORDER_DATA_TYPES.V3_SELL,
        payouts: params.payouts![0]!,
        originFeeFirst: params.originFeeFirst!,
        originFeeSecond: params.originFeeSecond!,
        maxFeesBasePoint: params.maxFeesBasePoint!,
        marketplaceMarker: params.marketplaceMarker!,
      };
      return v3SellData;
    case ORDER_DATA_TYPES.V3_BUY:
      const v3BuyData: Types.IV3OrderBuyData = {
        dataType: ORDER_DATA_TYPES.V3_BUY,
        payouts: params.payouts![0]!,
        originFeeFirst: params.originFeeFirst!,
        originFeeSecond: params.originFeeSecond!,
        marketplaceMarker: params.marketplaceMarker!,
      };
      return v3BuyData;
    default:
      throw Error("Unknown order data type");
  }
};
