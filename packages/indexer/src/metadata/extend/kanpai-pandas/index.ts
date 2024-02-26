import axios from "axios";
import { TokenMetadata } from "@/metadata/types";
import { logger } from "@/common/logger";

const metadataBaseURI = "https://metadata-api-snag-solutions-ad3b2d55c570.herokuapp.com/api/token";

export const extend = async (metadata: TokenMetadata) => {
  try {
    const response = await axios.get(`${metadataBaseURI}/${metadata.tokenId}`);

    const { Attached, Inventory, Rank } = response.data.data;
    const attributes = (Attached || [])
      .map((a: { Category: string; Name: string }) => ({
        key: a.Category,
        value: a.Name,
        kind: "string",
        rank: Rank,
      }))
      .concat(
        (Inventory || []).map((a: { Category: string; Name: string }) => ({
          key: a.Category,
          value: a.Name,
          kind: "string",
          rank: Rank,
        }))
      );
    return {
      ...metadata,
      attributes,
    };
  } catch (error) {
    logger.error(
      "kanpai-pandas-fetcher",
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
