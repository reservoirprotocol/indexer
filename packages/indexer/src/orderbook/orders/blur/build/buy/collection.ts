import axios from "axios";

import { now } from "@/common/utils";
import { config } from "@/config/index";
import { BaseOrderBuildOptions } from "@/orderbook/orders/blur/build/utils";

interface BuildOrderOptions extends BaseOrderBuildOptions {
  quantity?: number;
}

export const build = async (options: BuildOrderOptions) => {
  let url = `${config.orderFetcherBaseUrl}/api/blur-create-bid`;
  url += `?contract=${options.contract}`;
  url += `&weiPrice=${options.weiPrice}`;
  url += `&quantity=${options.quantity ?? 1}`;
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
    signData: response.signData,
    marketplaceData: response.marketplaceData,
  };
};
