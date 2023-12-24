import { Contract, utils } from "ethers";
import { baseProvider } from "@/common/provider";
import { CollectionMetadata, TokenMetadata } from "@/metadata/types";

export const extendCollection = async (metadata: CollectionMetadata, _tokenId: number) => {
  const nft = new Contract(
    metadata.contract,
    new utils.Interface(["function tokenCreator(uint256 tokenId) view returns (address)"]),
    baseProvider
  );

  const creatorAddress = await nft.tokenCreator(_tokenId);

  if (creatorAddress) {
    metadata.id = `${metadata.contract}:foundation-shared-${creatorAddress}`.toLowerCase();
    metadata.name = "Foundation";
    metadata.creator = creatorAddress;
    return {
      ...metadata,
    };
  }

  return metadata;
};

export const extend = async (metadata: TokenMetadata) => {
  const nft = new Contract(
    metadata.contract,
    new utils.Interface(["function tokenCreator(uint256 tokenId) view returns (address)"]),
    baseProvider
  );

  const creatorAddress = await nft.tokenCreator(metadata.tokenId);

  if (creatorAddress) {
    metadata.collection = `${metadata.contract}:foundation-shared-${creatorAddress}`.toLowerCase();
    return {
      ...metadata,
    };
  }

  return metadata;
};
