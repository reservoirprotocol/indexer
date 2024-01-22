import axios from "axios";
import { TokenMetadata } from "@/metadata/types";

export const extend = async (metadata: TokenMetadata) => {
  const metadataBaseURI = "https://punks2023.com/api/marketplace";
  const response = await axios.get(`${metadataBaseURI}/${metadata.tokenId}`);

  const { attributes: customAttributes } = response.data as {
    attributes: Array<{
      trait_type: string;
      value: string;
      display_type: string;
    }>;
  };
  const attributes = (customAttributes || []).map((attribute) => ({
    key: attribute.trait_type,
    value: attribute.value,
    kind: "string",
  }));
  return {
    ...metadata,
    attributes,
  };
};
