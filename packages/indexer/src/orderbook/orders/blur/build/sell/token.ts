import * as Sdk from "@reservoir0x/sdk";
import axios from "axios";

import { now } from "@/common/utils";
import { config } from "@/config/index";
import { BaseOrderBuildOptions, getBuildInfo } from "@/orderbook/orders/blur/build/utils";

interface BuildOrderOptions extends BaseOrderBuildOptions {
  tokenId: string;
}

export const build = async (options: BuildOrderOptions) => {
  const { feeRate } = await getBuildInfo(options);

  let url = `${config.orderFetcherBaseUrl}/api/blur-create-listing`;
  url += `?contract=${options.contract}`;
  url += `&tokenId=${options.tokenId}`;
  url += `&weiPrice=${options.weiPrice}`;
  url += `&feeRate=${feeRate}`;
  url += `&maker=${options.maker}`;
  url += `&expirationTime=${options.expirationTime ?? now() + 24 * 3600}`;
  url += `&authToken=${options.authToken}`;

  const response: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    signData: { value: any; domain: any; types: any };
    marketplaceData: string;
  } = await axios
    .get(url, {
      headers: {
        "X-Api-Key": config.orderFetcherApiKey,
      },
    })
    .then((response) => response.data.data);

  return {
    order: new Sdk.Blur.Order(config.chainId, response.signData.value),
    signData: response.signData,
    marketplaceData: response.marketplaceData,
  };
};
