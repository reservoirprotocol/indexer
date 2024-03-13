/* eslint-disable @typescript-eslint/no-explicit-any */

import axios from "axios";
import { logger } from "@/common/logger";

export const fetchTokenURI = async (
  { contract, tokenId }: { contract: string; tokenId: string },
  uri: string
) => {
  logger.info(
    "otherside-koda-fetcher",
    JSON.stringify({
      message: `fetchTokenURI. contract=${contract}, tokenId=${tokenId}, uri=${uri}`,
      contract,
      tokenId,
    })
  );

  return axios.get(uri, {
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "U00x06aeqZ-Reservoir",
    },
  });
};
