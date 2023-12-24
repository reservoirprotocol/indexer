import axios from "axios";

import { now } from "@/common/utils";
import { config } from "@/config/index";
import { BaseOrderBuildOptions, getBuildInfo } from "@/orderbook/orders/blur/build/utils";

interface BuildOrderOptions extends BaseOrderBuildOptions {
  tokenId: string;
}

export const build = async (options: BuildOrderOptions) => {
  const { feeRate } = await getBuildInfo(options);

  const response: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    signData: { value: any; domain: any; types: any };
    marketplaceData: string;
  } = await axios
    .post(`${config.orderFetcherBaseUrl}/api/blur-create-listing`, {
      contract: options.contract,
      tokenId: options.tokenId,
      weiPrice: options.weiPrice,
      feeRate,
      maker: options.maker,
      expirationTime: options.expirationTime ?? now() + 24 * 3600,
      authToken: options.authToken,
    })
    .then((response) => response.data.data);

  return {
    signData: response.signData,
    marketplaceData: response.marketplaceData,
  };
};
