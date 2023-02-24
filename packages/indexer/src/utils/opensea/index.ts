import axios from "axios";

import { config } from "@/config/index";
import * as flagStatusUpdate from "@/jobs/flag-status/update";

export const tryGetTokensSuspiciousStatus = async (tokens: string[], timeout = 5000) => {
  const tokenToSuspicious = new Map<string, boolean>();

  if (tokens.length) {
    const searchParams = new URLSearchParams();
    tokens.forEach((t) => {
      const [contract, tokenId] = t.split(":");
      searchParams.append("asset_contract_addresses", contract);
      searchParams.append("token_ids", tokenId);
    });

    await Promise.race([
      (async () => {
        await axios
          .get(
            `https://${
              config.chainId === 5 ? "testnets-api" : "api"
            }.opensea.io/api/v1/assets?${searchParams.toString()}`,
            {
              headers: {
                "Content-Type": "application/json",
                "X-Api-Key": config.openSeaApiKey,
              },
            }
          )
          .then(async (response) => {
            for (const asset of response.data.assets) {
              const contract = asset.asset_contract.address;
              const tokenId = asset.token_id;

              tokenToSuspicious.set(`${contract.toLowerCase()}:${tokenId}`, !asset.supports_wyvern);
            }

            // Asynchronously trigger a flag status refresh
            await flagStatusUpdate.addToQueue(
              [...tokenToSuspicious.entries()].map(([token, isFlagged]) => ({
                contract: token.split(":")[0],
                tokenId: token.split(":")[1],
                isFlagged,
              }))
            );
          })
          .catch(() => {
            // Skip errors
          });
      })(),
      new Promise((resolve) => setTimeout(resolve, timeout)),
    ]);
  }

  return tokenToSuspicious;
};

export const tryGetCollectionOpenseaFees = async (
  contract: string,
  tokenId: string,
  timeout = 5000
) => {
  let openseaFees = new Map<string, number>();
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
