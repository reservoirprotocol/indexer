import * as Sdk from "@reservoir0x/sdk";
import { BaseBuildParams } from "@reservoir0x/sdk/dist/looks-rare/builders/base";
import axios from "axios";

import { redb } from "@/common/db";
import { fromBuffer } from "@/common/utils";
import { config } from "@/config/index";

export interface BaseOrderBuildOptions {
  maker: string;
  contract: string;
  weiPrice: string;
  listingTime?: number;
  expirationTime?: number;
}

type OrderBuildInfo = {
  params: BaseBuildParams;
};

export const getBuildInfo = async (
  options: BaseOrderBuildOptions,
  collection: string,
  side: "sell" | "buy"
): Promise<OrderBuildInfo> => {
  const collectionResult = await redb.oneOrNone(
    `
      SELECT
        contracts.address
      FROM collections
      JOIN contracts
        ON collections.contract = contracts.address
      WHERE collections.id = $/collection/
      LIMIT 1
    `,
    { collection }
  );
  if (!collectionResult) {
    // Skip if we cannot retrieve the collection
    throw new Error("Could not fetch token collection");
  }

  const buildParams: BaseBuildParams = {
    isOrderAsk: side === "sell",
    collection: fromBuffer(collectionResult.address),
    signer: options.maker,
    // Protocol fee (1.5%) + optional fixed royalties (0.5%)
    minPercentageToAsk: 9800,
    price: options.weiPrice,
    // LooksRare uses WETH instead of ETH for sell orders too
    currency: Sdk.Common.Addresses.Weth[config.chainId],
    // TODO: We should only use LooksRare's nonce when cross-posting to their orderbook
    nonce: await axios
      .get(
        `https://${
          config.chainId === 5 ? "api-goerli." : "api."
        }looksrare.org/api/v1/orders/nonce?address=${options.maker}`,
        {
          headers:
            config.chainId === 1
              ? {
                  "Content-Type": "application/json",
                  "X-Looks-Api-Key": config.looksRareApiKey,
                }
              : {
                  "Content-Type": "application/json",
                },
        }
      )
      .then(({ data }: { data: { data: string } }) => data.data),
    startTime: options.listingTime,
    endTime: options.expirationTime,
  };

  return {
    params: buildParams,
  };
};
