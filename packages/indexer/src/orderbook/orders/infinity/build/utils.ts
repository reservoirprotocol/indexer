import { parseUnits } from "@ethersproject/units";
import { Common, Infinity } from "@reservoir0x/sdk";
import axios from "axios";

import { config } from "@/config/index";
import { now } from "@/common/utils";

export const orderbooks = {
  infinity: {
    autoExecutionSupported: true,
  },
};

export interface BaseOrderBuildOptions {
  maker: string;
  weiPrice: string;
  currency?: string;
  nonce?: string;
  listingTime?: number;
  expirationTime?: number;
  maxGasPrice?: number;
  orderbook: keyof typeof orderbooks;
}

export type BuildInfo = Pick<
  Infinity.Types.OrderInput,
  | "isSellOrder"
  | "signer"
  | "startPrice"
  | "endPrice"
  | "startTime"
  | "endTime"
  | "maxGasPrice"
  | "nonce"
  | "currency"
>;

export const getBuildInfo = async (
  options: BaseOrderBuildOptions,
  side: "sell" | "buy"
): Promise<{ params: BuildInfo }> => {
  const maxGasPrice = parseUnits("20", "gwei").toString();

  const buildParams: BuildInfo = {
    isSellOrder: side === "sell",
    signer: options.maker,
    startPrice: options.weiPrice,
    endPrice: options.weiPrice,
    currency:
      options.currency ?? side === "sell"
        ? Common.Addresses.Eth[config.chainId]
        : Common.Addresses.Weth[config.chainId],
    startTime: options.listingTime || now() - 1 * 60,
    endTime: options.expirationTime || now() + 7 * 24 * 3600,
    nonce: options.nonce ?? (await getNonce(options.orderbook, options.maker, config.chainId)),
    maxGasPrice: orderbooks[options.orderbook].autoExecutionSupported ? maxGasPrice : "1",
  };

  return {
    params: buildParams,
  };
};

async function getNonce(
  orderbook: keyof typeof orderbooks,
  maker: string,
  chainId: number
): Promise<string> {
  switch (orderbook) {
    case "infinity": {
      const headers: Record<string, string> =
        config.infinityApiKey && typeof config.infinityApiKey === "string"
          ? {
              "x-api-key": config.infinityApiKey,
            }
          : {};

      const response = await axios.get(`https://sv.infinity.xyz/userOrders/${maker}/nonce`, {
        params: {
          chainId: `${chainId}`,
        },
        headers,
      });

      const nonce = response.data as number;
      return nonce.toString();
    }

    default: {
      throw new Error(`Nonce not implemented for orderbook ${orderbook}`);
    }
  }
}
