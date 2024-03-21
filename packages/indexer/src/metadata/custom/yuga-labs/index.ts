/* eslint-disable @typescript-eslint/no-explicit-any */

import axios from "axios";
import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { onchainMetadataProvider } from "../../providers/onchain-metadata-provider";

export const fetchTokenUriMetadata = async (
  { contract, tokenId }: { contract: string; tokenId: string },
  uri: string
) => {
  logger.info(
    "yuga-labs-fetcher",
    JSON.stringify({
      message: `fetchTokenUriMetadata. contract=${contract}, tokenId=${tokenId}, uri=${uri}`,
      contract,
      tokenId,
    })
  );

  return axios
    .get(uri, {
      headers: {
        "Content-Type": "application/json",
        "User-Agent": config.yugalabsMetadataApiUserAgent,
      },
    })
    .then((res) => onchainMetadataProvider.handleResponse(contract, tokenId, res))
    .catch((error) => onchainMetadataProvider.handleErrorResponse(contract, tokenId, error));
};
