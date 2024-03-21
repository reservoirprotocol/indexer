import * as Sdk from "@reservoir0x/sdk";

import { getBuildInfo } from "@/orderbook/orders/seaport-v1.5/build/utils";
import {
  BuyTokenBuilderBase,
  BuildOrderOptions,
} from "@/orderbook/orders/seaport-base/build/buy/token";

export const build = async (options: BuildOrderOptions) => {
  const builder = new BuyTokenBuilderBase(getBuildInfo);
  return builder.build(options, Sdk.SeaportV15.Order);
};
