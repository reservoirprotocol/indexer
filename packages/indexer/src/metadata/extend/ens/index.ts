/* eslint-disable @typescript-eslint/no-explicit-any */

import { logger } from "@/common/logger";
import { TokenMetadata } from "@/metadata/types";
import axios from "axios";
import { getNetworkName } from "@/config/network";

export const extend = async (metadata: TokenMetadata) => {
  try {
    const url = `https://metadata.ens.domains/${getNetworkName()}/${metadata.contract}/${
      metadata.tokenId
    }`;
    const { data } = await axios.get(url);

    return {
      contract: metadata.contract,
      tokenId: metadata.tokenId,
      collection: metadata.contract,
      name: data.name,
      description: data.description,
      imageUrl: data.image,
      imageOriginalUrl: data.image,
      mediaUrl: null,
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
  } catch (error) {
    logger.error(
      "ens-fetcher",
      JSON.stringify({
        message: `fetchToken get json error. error:${error}`,
        contract: metadata.contract,
        tokenId: metadata.tokenId,
        error,
      })
    );
  }

  return {
    ...metadata,
  };
};
