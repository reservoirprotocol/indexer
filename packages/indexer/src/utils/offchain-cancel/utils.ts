import { AddressZero } from "@ethersproject/constants";
import * as Sdk from "@reservoir0x/sdk";

import { config } from "@/config/index";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const isOrderNativeOffChainCancellable = (rawData?: any) => {
  // Seaport
  if (rawData?.zone) {
    return (
      rawData.zone === Sdk.SeaportBase.Addresses.ReservoirCancellationZone[config.chainId] ||
      rawData.zone === Sdk.SeaportBase.Addresses.ReservoirV16CancellationZone[config.chainId]
    );
  }

  // Payment Processor
  if (rawData?.cosigner) {
    return rawData.cosigner !== AddressZero;
  }

  return false;
};
