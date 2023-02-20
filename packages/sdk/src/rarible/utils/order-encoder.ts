import { constants, utils } from "ethers";
import { Constants, Types } from "..";
import { ORDER_DATA_TYPES } from "../constants";
import { AssetClass, IPart, LocalAssetType } from "../types";
import { getOrderSide } from "./order-info";

export const encodeAssetData = (assetType: LocalAssetType) => {
  switch (assetType.assetClass) {
    case AssetClass.ETH:
      return "0x";
    case AssetClass.ERC20:
    case AssetClass.COLLECTION:
      return utils.defaultAbiCoder.encode(["address"], [assetType.contract]);
    case AssetClass.ERC721:
    case AssetClass.ERC1155:
      return utils.defaultAbiCoder.encode(
        ["address", "uint256"],
        [assetType.contract, assetType.tokenId]
      );
    case AssetClass.ERC721_LAZY:
      return utils.defaultAbiCoder.encode(
        [
          "address contract",
          "tuple(uint256 tokenId, string uri, tuple(address account, uint96 value)[] creators, tuple(address account, uint96 value)[] royalties, bytes[] signatures)",
        ],
        [
          assetType.contract,
          {
            tokenId: assetType.tokenId,
            uri: assetType.uri,
            creators: encodeV2OrderData(assetType.creators),
            royalties: encodeV2OrderData(assetType.royalties),
            signatures: assetType.signatures || [],
          },
        ]
      );
    case AssetClass.ERC1155_LAZY:
      return utils.defaultAbiCoder.encode(
        [
          "address contract",
          "tuple(uint256 tokenId, string uri, uint256 supply, tuple(address account, uint96 value)[] creators, tuple(address account, uint96 value)[] royalties, bytes[] signatures)",
        ],
        [
          assetType.contract,
          {
            tokenId: assetType.tokenId,
            uri: assetType.uri,
            supply: assetType.supply,
            creators: encodeV2OrderData(assetType.creators),
            royalties: encodeV2OrderData(assetType.royalties),
            signatures: assetType.signatures || [],
          },
        ]
      );
    default:
      throw Error("Unknown rarible asset data");
  }
};

export const encodeAssetClass = (assetClass: string) => {
  if (!assetClass) {
    return "0xffffffff";
  }

  return utils.keccak256(utils.toUtf8Bytes(assetClass)).substring(0, 10);
};

export const encodeV2OrderData = (payments: IPart[] | undefined) => {
  if (!payments) {
    return [];
  }
  return payments;
};

// V3 Order Data fields are encoded in a special way. From Rarible's docs:
// - `uint payouts`, `uint originFeeFirst`, `uint originFeeSecond`, work the same as in `V1` orders, but there is only 1 value
// and address + amount are encoded into uint (first 12 bytes for amount, last 20 bytes for address), not using `LibPart.Part` struct
export const encodeV3OrderData = (part: IPart) => {
  if (!part) {
    return utils.defaultAbiCoder.encode(["uint"], ["0"]);
  }

  const { account, value } = part;
  const uint96EncodedValue = utils.solidityPack(["uint96"], [value]);
  const encodedData = `${uint96EncodedValue}${account.slice(2)}`;

  return encodedData;
};

export const encodeOrderData = (
  order: Types.Order | Types.TakerOrderParams
) => {
  let encodedOrderData = "";

  switch (order.data.dataType) {
    case ORDER_DATA_TYPES.V1:
    case ORDER_DATA_TYPES.API_V1:
      const v1Data = order.data as Types.IV1OrderData;

      encodedOrderData = utils.defaultAbiCoder.encode(
        [
          "tuple(tuple(address account,uint96 value)[] payouts, tuple(address account,uint96 value)[] originFees)",
        ],
        [
          {
            payouts: encodeV2OrderData(v1Data.payouts),
            originFees: encodeV2OrderData(v1Data.originFees),
          },
        ]
      );
      break;

    case Constants.ORDER_DATA_TYPES.V2:
    case Constants.ORDER_DATA_TYPES.API_V2:
      const v2Data = order.data as Types.IV2OrderData;
      const side = getOrderSide(
        order.make.assetType.assetClass,
        order.take.assetType.assetClass
      );

      const isMakeFill = side === "buy" ? 0 : 1;

      encodedOrderData = utils.defaultAbiCoder.encode(
        [
          "tuple(tuple(address account,uint96 value)[] payouts, tuple(address account,uint96 value)[] originFees, bool isMakeFill)",
        ],
        [
          {
            payouts: encodeV2OrderData(v2Data.payouts),
            originFees: encodeV2OrderData(v2Data.originFees),
            isMakeFill: isMakeFill,
          },
        ]
      );
      break;
    case Constants.ORDER_DATA_TYPES.V3_SELL:
    case Constants.ORDER_DATA_TYPES.API_V3_SELL:
      const v3SellData = order.data as Types.IV3OrderSellData;

      encodedOrderData = utils.defaultAbiCoder.encode(
        [
          "uint payouts",
          "uint originFeeFirst",
          "uint originFeeSecond",
          "uint maxFeesBasePoint",
          "bytes32 marketplaceMarker",
        ],
        [
          encodeV3OrderData(v3SellData.payouts),
          encodeV3OrderData(v3SellData.originFeeFirst),
          encodeV3OrderData(v3SellData.originFeeSecond),
          // TODO: Think of how to generate when maxFeesBasePoint is not passed in case of buy orders
          v3SellData.maxFeesBasePoint || "1000",
          utils.keccak256(
            utils.toUtf8Bytes(v3SellData.marketplaceMarker || "")
          ),
        ]
      );

      break;
    case Constants.ORDER_DATA_TYPES.V3_BUY:
    case Constants.ORDER_DATA_TYPES.API_V3_BUY:
      const v3BuyData = order.data as Types.IV3OrderBuyData;

      encodedOrderData = utils.defaultAbiCoder.encode(
        [
          "uint payouts",
          "uint originFeeFirst",
          "uint originFeeSecond",
          "bytes32 marketplaceMarker",
        ],
        [
          encodeV3OrderData(v3BuyData.payouts),
          encodeV3OrderData(v3BuyData.originFeeFirst),
          encodeV3OrderData(v3BuyData.originFeeSecond),
          utils.keccak256(utils.toUtf8Bytes(v3BuyData.marketplaceMarker || "")),
        ]
      );
      break;
    default:
      throw Error("Unknown rarible order type");
  }
  return encodedOrderData;
};

export const hashAssetType = (assetType: LocalAssetType) => {
  const encodedAssetType = utils.defaultAbiCoder.encode(
    ["bytes32", "bytes4", "bytes32"],
    [
      utils.keccak256(
        utils.toUtf8Bytes("AssetType(bytes4 assetClass,bytes data)")
      ),
      encodeAssetClass(assetType.assetClass),
      utils.keccak256(encodeAssetData(assetType)),
    ]
  );
  return utils.keccak256(encodedAssetType);
};

/**
 * Encode Order object for contract calls
 * @param order
 * @returns encoded order which is ready to be signed
 */
export const encodeForContract = (
  order: Types.Order,
  matchingOrder: Types.TakerOrderParams
) => {
  switch (order.side) {
    case "buy":
      const bid: Types.AcceptBid = {
        bidMaker: order.maker,
        bidNftAmount: order.take.value,
        nftAssetClass: encodeAssetClass(order.take.assetType.assetClass),
        nftData: encodeAssetData(order.take.assetType),
        bidPaymentAmount: order.make.value,
        paymentToken: order.make.assetType.contract || constants.AddressZero,
        bidSalt: order.salt,
        bidStart: order.start,
        bidEnd: order.end,
        bidDataType: encodeAssetClass(order.data?.dataType!),
        bidData: encodeOrderData(order),
        bidSignature: order.signature!,
        sellOrderPaymentAmount: matchingOrder.take.value,
        sellOrderNftAmount: Number(matchingOrder.make.value),
        sellOrderData: encodeOrderData(matchingOrder),
      };
      return bid;
    case "sell":
      const purchase: Types.Purchase = {
        sellOrderMaker: order.maker,
        sellOrderNftAmount: order.make.value,
        nftAssetClass: encodeAssetClass(order.make.assetType.assetClass),
        nftData: encodeAssetData(order.make.assetType),
        sellOrderPaymentAmount: order.take.value,
        paymentToken: order.take.assetType.contract || constants.AddressZero,
        sellOrderSalt: order.salt,
        sellOrderStart: order.start,
        sellOrderEnd: order.end,
        sellOrderDataType: encodeAssetClass(order.data?.dataType!),
        sellOrderData: encodeOrderData(order),
        sellOrderSignature: order.signature!,
        buyOrderPaymentAmount: matchingOrder.make.value,
        buyOrderNftAmount: Number(matchingOrder.take.value),
        buyOrderData: encodeOrderData(matchingOrder),
      };
      return purchase;
    default:
      throw Error("Unknown order side");
  }
};

/**
 * Encode Order object for contract calls
 * @param order
 * @returns encoded order which is ready to be signed
 */
export const encodeForMatchOrders = (
  order: Types.Order | Types.TakerOrderParams
) => {
  return {
    maker: order.maker,
    makeAsset: {
      assetType: {
        assetClass: encodeAssetClass(order.make.assetType.assetClass),
        data: encodeAssetData(order.make.assetType),
      },
      value: order.make.value,
    },
    taker: order.taker,
    takeAsset: {
      assetType: {
        assetClass: encodeAssetClass(order.take.assetType.assetClass),
        data: encodeAssetData(order.take.assetType),
      },
      value: order.take.value,
    },
    salt: order.salt,
    start: order.start,
    end: order.end,
    dataType: encodeAssetClass(order.data?.dataType!),
    data: encodeOrderData(order),
  };
};
