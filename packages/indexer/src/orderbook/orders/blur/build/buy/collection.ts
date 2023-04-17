import axios from "axios";

import { now } from "@/common/utils";
import { config } from "@/config/index";
import { BaseOrderBuildOptions } from "@/orderbook/orders/blur/build/utils";

interface BuildOrderOptions extends BaseOrderBuildOptions {
  quantity?: number;
}

export const build = async (options: BuildOrderOptions) => {
  const response: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    signData: { value: any; domain: any; types: any };
    marketplaceData: string;
  } = await axios
    .post(`${config.orderFetcherBaseUrl}/api/blur-create-bid`, {
      contract: options.contract,
      weiPrice: options.weiPrice,
      quantity: options.quantity ?? 1,
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
