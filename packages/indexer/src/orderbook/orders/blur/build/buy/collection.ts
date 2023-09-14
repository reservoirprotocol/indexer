import { formatEther } from "@ethersproject/units";
import axios from "axios";

import { now } from "@/common/utils";
import { config } from "@/config/index";
import { BaseOrderBuildOptions } from "@/orderbook/orders/blur/build/utils";

interface BuildOrderOptions extends BaseOrderBuildOptions {
  quantity?: number;
}

export const build = async (options: BuildOrderOptions) => {
  const minimumExpirationTime = 10 * 24 * 3600;

  const currentTime = now();
  const expirationTime = options.expirationTime ?? currentTime + minimumExpirationTime;

  if (expirationTime < currentTime + minimumExpirationTime) {
    throw new Error("Expiration time too low (must be at least 10 days)");
  }

  const formattedPrice = formatEther(options.weiPrice);
  if (formattedPrice.includes(".") && formattedPrice.split(".")[1].length > 2) {
    throw new Error("The minimum precision of the price can be 0.01");
  }

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
      expirationTime,
      authToken: options.authToken,
    })
    .then((response) => response.data.data);

  return {
    signData: response.signData,
    marketplaceData: response.marketplaceData,
  };
};
