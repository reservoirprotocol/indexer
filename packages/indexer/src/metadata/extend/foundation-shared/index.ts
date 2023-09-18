import { Contract, utils } from "ethers";
import { baseProvider } from "@/common/provider";
import { CollectionMetadata, TokenMetadata } from "@/utils/metadata-api";

export const extendCollection = async (
  _chainId: number,
  metadata: CollectionMetadata,
  _tokenId: number
) => {
  const nft = new Contract(
    metadata.contract,
    new utils.Interface(["function tokenCreator(uint256 _tokenId) view returns (address)"]),
    baseProvider
  );

  const creatorAddress = await nft.tokenCreator(_tokenId);

  if (creatorAddress) {
    metadata.id = `${metadata.contract}:superrare-shared-${creatorAddress}`;
    metadata.name = "Foundation";
    return {
      ...metadata,
    };
  }

  return metadata;
};

export const extend = async (_chainId: number, metadata: TokenMetadata) => {
  const nft = new Contract(
    metadata.contract,
    new utils.Interface(["function tokenCreator(uint256 tokenId) view returns (address)"]),
    baseProvider
  );

  const creatorAddress = await nft.tokenCreator(metadata.tokenId);

  if (creatorAddress) {
    metadata.collection = `${metadata.contract}:foundation-shared-${creatorAddress}`;
    return {
      ...metadata,
    };
  }

  return metadata;
};
