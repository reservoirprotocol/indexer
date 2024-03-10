import { idb } from "@/common/db";
import { toBuffer } from "@/common/utils";

// Utility functions for parsing cdc event data

export async function getTokenMetadata(tokenId: string, contract: string) {
  const r = await idb.oneOrNone(
    `
    SELECT
      tokens.name,
      tokens.image,
      tokens.image_version,
      (tokens.metadata ->> 'image_mime_type')::TEXT AS image_mime_type,
      tokens.collection_id,
      collections.name AS collection_name
    FROM tokens
    LEFT JOIN collections 
      ON tokens.collection_id = collections.id
    WHERE tokens.contract = $/contract/ AND tokens.token_id = $/token_id/
  `,
    {
      token_id: tokenId,
      contract: toBuffer(contract),
    }
  );
  return r;
}

export const formatValidBetween = (validBetween: string) => {
  try {
    const parsed = JSON.parse(validBetween.replace("infinity", "null"));
    return {
      validFrom: Math.floor(new Date(parsed[0]).getTime() / 1000),
      validUntil: Math.floor(new Date(parsed[1]).getTime() / 1000),
    };
  } catch (error) {
    return {
      validFrom: null,
      validUntil: null,
    };
  }
};

export const formatStatus = (fillabilityStatus: string, approvalStatus: string) => {
  switch (fillabilityStatus) {
    case "filled":
      return "filled";
    case "cancelled":
      return "cancelled";
    case "expired":
      return "expired";
    case "no-balance":
      return "inactive";
  }

  switch (approvalStatus) {
    case "no-approval":
    case "disabled":
      return "inactive";
  }

  return "active";
};
