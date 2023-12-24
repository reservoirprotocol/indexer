/* eslint-disable @typescript-eslint/no-explicit-any */

import { Contract, utils } from "ethers";

import axios from "axios";
import { baseProvider } from "@/common/provider";
import { TokenMetadata } from "@/metadata/types";

export const extend = async (metadata: TokenMetadata) => {
  const nft = new Contract(
    metadata.contract,
    new utils.Interface(["function immutableAttributeURI(uint256 tokenId) view returns (string)"]),
    baseProvider
  );

  const immutableAttributeURI = await nft.immutableAttributeURI(metadata.tokenId);

  const immutableAttributes = await axios
    .get(immutableAttributeURI)
    .then((response) => response.data?.attributes);

  return {
    ...metadata,
    attributes: [
      ...metadata.attributes,
      ...immutableAttributes.map((a: any) => ({
        key: a.trait_type,
        value: a.value,
        kind: isNaN(a.value) ? "string" : "number",
      })),
    ],
  };
};
