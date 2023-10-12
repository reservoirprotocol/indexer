/* eslint-disable @typescript-eslint/no-explicit-any */

import { TokenMetadata } from "@/metadata/types";

import axios from "axios";

const metadataBaseURI =
  "https://us-central1-goldfinch-frontends-prod.cloudfunctions.net/poolTokenMetadata";

const ranks = {
  "Pool Name": 99,
  "Borrower Name": 98,
  "USDC Interest Rate": 97,
  "Backer Position Principal": 96,
  "Last Updated At": 0,
};

export const extend = async (metadata: TokenMetadata) => {
  const response = await axios.get(`${metadataBaseURI}/${metadata.tokenId}`);
  const attributes = response.data.attributes.map((a: { trait_type: string; value: string }) => ({
    key: a.trait_type ?? "property",
    value: a.value,
    kind: "string",
    rank:
      ranks[a.trait_type as keyof typeof ranks] !== undefined
        ? ranks[a.trait_type as keyof typeof ranks]
        : 1,
  }));
  return {
    ...metadata,
    attributes,
    imageUrl: response.data.image,
  };
};
