import { Contract, utils } from "ethers";
import { baseProvider } from "@/common/provider";
import axios from "axios";
import { CollectionMetadata, TokenMetadata } from "@/metadata/types";
export const extendCollection = async (metadata: CollectionMetadata, _tokenId: number) => {
  const nft = new Contract(
    metadata.contract,
    new utils.Interface([
      "function tokenCreator(uint256 _tokenId) view returns (address)",
      "function tokenURI(uint256 tokenId) view returns (string)",
    ]),
    baseProvider
  );

  const creatorAddress = await nft.tokenCreator(_tokenId);
  const tokenURI = await nft.tokenURI(_tokenId);

  if (creatorAddress && tokenURI) {
    metadata.id = `${metadata.contract}:superrare-shared-${creatorAddress}`.toLowerCase();
    metadata.creator = creatorAddress;
    await axios.get(tokenURI).then((rawMetadata) => {
      metadata.name = `SuperRare 1/1s: ${rawMetadata.data.createdBy}`;
    });
    return {
      ...metadata,
    };
  }

  return metadata;
};

export const extend = async (metadata: TokenMetadata) => {
  const nft = new Contract(
    metadata.contract,
    new utils.Interface(["function tokenCreator(uint256 _tokenId) view returns (address)"]),
    baseProvider
  );

  const creatorAddress = await nft.tokenCreator(metadata.tokenId);

  if (creatorAddress) {
    metadata.collection = `${metadata.contract}:superrare-shared-${creatorAddress}`.toLowerCase();
    return {
      ...metadata,
    };
  }

  return metadata;
};
