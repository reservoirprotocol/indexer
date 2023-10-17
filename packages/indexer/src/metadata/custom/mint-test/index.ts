/* eslint-disable @typescript-eslint/no-explicit-any */

import axios from "axios";

export const fetchToken = async ({ contract, tokenId }: { contract: string; tokenId: string }) => {
  const url = `https://test-tokens-metadata.vercel.app/api/erc721/${tokenId}`;
  const { data } = await axios.get(url);

  return {
    contract,
    tokenId,
    collection: contract,
    name: data.name,
    description: data.description,
    imageUrl: data.image,
    imageOriginalUrl: data.image,
    metadataOriginalUrl: url,
    attributes: data.attributes.map((attribute: any) => {
      return {
        key: attribute.trait_type,
        value: attribute.value,
        kind: "string",
        rank: 1,
      };
    }),
  };
};
