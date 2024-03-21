import * as Sdk from "@reservoir0x/sdk";

import { getBuildInfo } from "@/orderbook/orders/seaport-v1.5/build/utils";
import {
  SellTokenBuilderBase,
  BuildOrderOptions,
} from "@/orderbook/orders/seaport-base/build/sell/token";

export const build = async (options: BuildOrderOptions) => {
  const builder = new SellTokenBuilderBase(getBuildInfo);
  return builder.build(options, Sdk.SeaportV15.Order);
};
