import { defaultAbiCoder } from "@ethersproject/abi";
import { BigNumberish } from "@ethersproject/bignumber";
import { keccak256 } from "@ethersproject/keccak256";
import { toUtf8Bytes } from "@ethersproject/strings";

import { Types } from "..";
import { Asset, IPart, LocalAssetType } from "../types";

export const encodeAsset = (token?: string, tokenId?: string) => {
  if (tokenId) {
    return defaultAbiCoder.encode(["address", "uint256"], [token, tokenId]);
  } else if (token) {
    return defaultAbiCoder.encode(["address"], [token]);
  } else {
    return "0x";
  }
};

export const encodeBundle = (tokenAddresses: string[], tokenIds: BigNumberish[]) => {
  const toEncode = tokenAddresses.map((token, index) => {
    return [token, tokenIds[index]];
  });
  return defaultAbiCoder.encode(["tuple(address,uint256[])[]"], [toEncode]);
};

export const encodeAssetData = (assetType: LocalAssetType) => {
  return encodeAsset(assetType.contract, assetType.tokenId);
};

export const encodeAssetClass = (assetClass: string) => {
  if (!assetClass) {
    return "0xffffffff";
  }
  return keccak256(toUtf8Bytes(assetClass)).substring(0, 10);
};

export const encodeOrderData = (payments: IPart[]) => {
  if (!payments) {
    return "0x";
  }
  return defaultAbiCoder.encode(
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
  const encodedAssetType = defaultAbiCoder.encode(
    ["bytes32", "bytes4", "bytes32"],
    [
      keccak256(toUtf8Bytes("AssetType(bytes4 assetClass,bytes data)")),
      encodeAssetClass(assetType.assetClass),
      keccak256(assetTypeData),
    ]
  );
  return keccak256(encodedAssetType);
};

export const hashAsset = (asset: Asset) => {
  const encodedAsset = defaultAbiCoder.encode(
    ["bytes32", "bytes32", "uint256"],
    [
      keccak256(
        toUtf8Bytes(
          "Asset(AssetType assetType,uint256 value)AssetType(bytes4 assetClass,bytes data)"
        )
      ),
      hashAssetType(asset.assetType),
      asset.value,
    ]
  );
  return keccak256(encodedAsset);
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
    // eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain
    dataType: encodeAssetClass(order.data?.dataType!),
    data: encodeOrderData(order.data?.revenueSplits || []),
  };
};
