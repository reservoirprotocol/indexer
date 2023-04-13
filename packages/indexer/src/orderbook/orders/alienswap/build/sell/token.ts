import * as Sdk from "@reservoir0x/sdk";

import { getBuildInfo } from "@/orderbook/orders/alienswap/build/utils";
import {
  SellTokenBuilderBase,
  BuildOrderOptions,
} from "@/orderbook/orders/seaport-base/build/sell/token";

export const build = async (options: BuildOrderOptions) => {
  const builder = new SellTokenBuilderBase(getBuildInfo);
  return await builder.build(options, Sdk.Alienswap.Order);
};
