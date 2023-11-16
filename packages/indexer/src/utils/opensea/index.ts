import axios from "axios";

import { config } from "@/config/index";

export const tryGetCollectionOpenseaFees = async (
  contract: string,
  tokenId: string,
  timeout = 5000
) => {
  let openseaFees: { [recipient: string]: number } = {};
  let isSuccess = false;

  await Promise.race([
    (async () => {
      await axios
        .get(
          `https://${
            config.chainId === 5 ? "testnets-api" : "api"
          }.opensea.io/api/v1/asset/${contract}/${tokenId}`,
          {
            headers:
              config.chainId === 5
                ? {
                    "Content-Type": "application/json",
                  }
                : {
                    "Content-Type": "application/json",
                    "X-Api-Key": config.openSeaApiKey,
                  },
          }
        )
        .then(async (response) => {
          openseaFees = response.data.collection.fees.opensea_fees;
          isSuccess = true;
        })
        .catch(() => {
          // Skip errors
        });
    })(),
    new Promise((resolve) => setTimeout(resolve, timeout)),
  ]);

  return { openseaFees, isSuccess };
};
