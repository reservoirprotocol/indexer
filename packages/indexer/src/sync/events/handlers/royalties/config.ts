import * as Sdk from "@reservoir0x/sdk";

import { config } from "@/config/index";
import { OrderKind } from "@/orderbook/orders";

// List of supported exchanges
export const supportedExchanges: Map<OrderKind, string> = new Map();
supportedExchanges.set("blur", Sdk.Blur.Addresses.Exchange[config.chainId]);
supportedExchanges.set("seaport", Sdk.SeaportV11.Addresses.Exchange[config.chainId]);
supportedExchanges.set("seaport-v1.4", Sdk.SeaportV14.Addresses.Exchange[config.chainId]);
supportedExchanges.set("seaport-v1.5", Sdk.SeaportV15.Addresses.Exchange[config.chainId]);
supportedExchanges.set("alienswap", Sdk.Alienswap.Addresses.Exchange[config.chainId]);
supportedExchanges.set("x2y2", Sdk.X2Y2.Addresses.Exchange[config.chainId]);
supportedExchanges.set("looks-rare", Sdk.LooksRare.Addresses.Exchange[config.chainId]);
supportedExchanges.set("wyvern-v2", Sdk.WyvernV2.Addresses.Exchange[config.chainId]);
supportedExchanges.set("wyvern-v2.3", Sdk.WyvernV23.Addresses.Exchange[config.chainId]);
supportedExchanges.set(
  "payment-processor",
  Sdk.PaymentProcessor.Addresses.Exchange[config.chainId]
);
supportedExchanges.set(
  "payment-processor-v2",
  Sdk.PaymentProcessorV2.Addresses.Exchange[config.chainId]
);
