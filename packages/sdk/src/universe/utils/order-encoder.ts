import { utils } from "ethers";
import { Types } from "..";
import { lc } from "../../utils";
import { Asset, IPart, LocalAssetType } from "../types";

export const encodeAsset = (token?: string, tokenId?: string) => {
  if (tokenId) {
    return utils.defaultAbiCoder.encode(
      ["address", "uint256"],
      [token, tokenId]
    );
  } else if (token) {
    return utils.defaultAbiCoder.encode(["address"], [token]);
  } else {
    return "0x";
  }
};

export const encodeBundle = (tokenAddresses: string[], tokenIds: any) => {
  const toEncode = tokenAddresses.map((token, index) => {
    return [token, tokenIds[index]];
  });
  return utils.defaultAbiCoder.encode(
    ["tuple(address,uint256[])[]"],
    [toEncode]
  );
};

export const encodeAssetData = (assetType: LocalAssetType) => {
  return encodeAsset(assetType.contract, assetType.tokenId);
};

export const encodeAssetClass = (assetClass: string) => {
  if (!assetClass) {
    return "0xffffffff";
  }
  return utils.keccak256(utils.toUtf8Bytes(assetClass)).substring(0, 10);
};

export const encodeOrderData = (payments: IPart[]) => {
  if (!payments) {
    return "0x";
  }
  return utils.defaultAbiCoder.encode(
    ["tuple(tuple(address account,uint96 value)[] revenueSplits)"],
    [
      {
        revenueSplits: payments,
      },
    ]
  );
};

export const hashAssetType = (assetType: LocalAssetType) => {
  const assetTypeData = encodeAssetData(assetType);
  const encodedAssetType = utils.defaultAbiCoder.encode(
    ["bytes32", "bytes4", "bytes32"],
    [
      utils.keccak256(
        utils.toUtf8Bytes("AssetType(bytes4 assetClass,bytes data)")
      ),
      encodeAssetClass(assetType.assetClass),
      utils.keccak256(assetTypeData),
    ]
  );
  return utils.keccak256(encodedAssetType);
};

export const hashAsset = (asset: Asset) => {
  const encodedAsset = utils.defaultAbiCoder.encode(
    ["bytes32", "bytes32", "uint256"],
    [
      utils.keccak256(
        utils.toUtf8Bytes(
          "Asset(AssetType assetType,uint256 value)AssetType(bytes4 assetClass,bytes data)"
        )
      ),
      hashAssetType(asset.assetType),
      asset.value,
    ]
  );
  return utils.keccak256(encodedAsset);
};

/**
 * Encode Order object for contract calls
 * @param order
 * @returns encoded order which is ready to be signed
 */
export const encode = (order: Types.TakerOrderParams | Types.Order) => {
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
    data: encodeOrderData(order.data?.revenueSplits || []),
  };
};
