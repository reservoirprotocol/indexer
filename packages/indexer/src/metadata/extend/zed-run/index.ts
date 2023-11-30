/* eslint-disable @typescript-eslint/no-explicit-any */

import { config } from "@/config/index";
import axios from "axios";

export const extend = async (metadata: any) => {
  let attributes;

  try {
    const response = await axios.get(
      `${
        config.chainId === 137
          ? "https://api.zed.run"
          : "https://metadata-service-reservoir-ved.zed.run"
      }/api/v1/horses/metadata/${metadata.tokenId}`
    );

    attributes = response.data.attributes.map((a: { trait_type: string; value: string }) => ({
      key: a.trait_type,
      value: a.value,
      kind: typeof a.value,
      rank: 1,
    }));
  } catch (error) {
    metadata.attributes.map((attribute: any) => {
      // Capitalize first letter of each word
      attribute.key = attribute.key
        .split("_")
        .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");

      if (attribute.key === "Birthday") {
        attribute.kind = "number";
        attribute.value = Number(attribute.value);
      }
    });

    attributes = metadata.attributes;
  }

  return { ...metadata, attributes };
};
