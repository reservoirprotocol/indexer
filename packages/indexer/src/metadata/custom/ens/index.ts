/* eslint-disable @typescript-eslint/no-explicit-any */

import axios from "axios";
import { getNetworkName } from "@/config/network";

export const fetchToken = async ({ contract, tokenId }: { contract: string; tokenId: string }) => {
  const url = `https://metadata.ens.domains/${getNetworkName()}/${contract}/${tokenId}`;
  const { data } = await axios.get(url);

  return {
    contract,
    tokenId,
    collection: contract,
    name: data.name,
    description: data.description,
    imageUrl: data.image,
    imageOriginalUrl: data.image,
    mediaUrl: data?.background_image,
    animationOriginalUrl: null,
    metadataOriginalUrl: url,
    attributes: data.attributes.map((attribute: any) => {
      return {
        key: attribute.trait_type,
        value: attribute.display_type === "date" ? attribute.value / 1000 : attribute.value,
        kind: attribute.display_type === "date" ? "number" : attribute.display_type,
        rank: 1,
      };
    }),
  };
};
