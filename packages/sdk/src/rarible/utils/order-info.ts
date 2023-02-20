import { Types } from "..";

export const getOrderSide = (
  makeAssetClass: string,
  takeAssetClass: string
) => {
  //TODO: Can be rewriten to be more readable
  if (
    (makeAssetClass === Types.AssetClass.ERC721 ||
      makeAssetClass === Types.AssetClass.COLLECTION ||
      makeAssetClass === Types.AssetClass.ERC721_LAZY ||
      makeAssetClass === Types.AssetClass.ERC1155 ||
      makeAssetClass === Types.AssetClass.ERC1155_LAZY) &&
    (takeAssetClass === Types.AssetClass.ERC20 ||
      takeAssetClass === Types.AssetClass.ETH ||
      takeAssetClass === Types.AssetClass.COLLECTION)
  ) {
    return "sell";
  } else if (
    (makeAssetClass === Types.AssetClass.ERC20 ||
      makeAssetClass === Types.AssetClass.ETH) &&
    (takeAssetClass === Types.AssetClass.ERC721 ||
      takeAssetClass === Types.AssetClass.ERC721_LAZY ||
      takeAssetClass === Types.AssetClass.ERC1155 ||
      takeAssetClass === Types.AssetClass.ERC1155_LAZY ||
      takeAssetClass === Types.AssetClass.COLLECTION)
  ) {
    return "buy";
  } else {
    throw new Error("Invalid asset class");
  }
};
