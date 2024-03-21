import * as Sdk from "@reservoir0x/sdk";

import { getBuildInfo } from "@/orderbook/orders/seaport-v1.6/build/utils";
import {
  BuyCollectionBuilderBase,
  BuildOrderOptions,
} from "@/orderbook/orders/seaport-base/build/buy/collection";

export const build = async (options: BuildOrderOptions) => {
  const builder = new BuyCollectionBuilderBase(getBuildInfo);
  return builder.build(options, Sdk.SeaportV16.Order);
};
