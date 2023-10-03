/* eslint-disable @typescript-eslint/no-explicit-any */

import { TokenMetadata } from "@/metadata/types";

export const extend = async (metadata: TokenMetadata) => {
  metadata.attributes.forEach((attribute: any) => {
    attribute.key = attribute.key.charAt(0).toUpperCase() + attribute.key.slice(1);
    attribute.kind = "string";
  });

  return metadata;
};
