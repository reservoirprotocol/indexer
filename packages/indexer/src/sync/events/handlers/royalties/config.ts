import * as Sdk from "@reservoir0x/sdk";

import { config } from "@/config/index";
import { OrderKind } from "@/orderbook/orders";

export const platformFeeRecipientsRegistry: Map<string, string[]> = new Map();
export const allPlatformFeeRecipients = new Set();

function addPlatformAddress(type: string, addrList: string[]) {
  platformFeeRecipientsRegistry.set(type, addrList);
  addrList.forEach((address) => allPlatformFeeRecipients.add(address));
}

addPlatformAddress("seaport", [
  "0x5b3256965e7c3cf26e11fcaf296dfc8807c01073",
  "0x8de9c5a032463c561423387a9648c5c7bcc5bc90",
  "0x0000a26b00c1f0df003000390027140000faa719",
]);

addPlatformAddress("seaport-v1.4", [
  "0x5b3256965e7c3cf26e11fcaf296dfc8807c01073",
  "0x8de9c5a032463c561423387a9648c5c7bcc5bc90",
  "0x0000a26b00c1f0df003000390027140000faa719",
]);

addPlatformAddress("alienswap", ["0x0b22c0359b550da6cf3766d8c0d7ffc00e28a136"]);

addPlatformAddress("wyvern-v2", [
  "0x5b3256965e7c3cf26e11fcaf296dfc8807c01073",
  "0x8de9c5a032463c561423387a9648c5c7bcc5bc90",
  "0x0000a26b00c1f0df003000390027140000faa719",
]);

addPlatformAddress("wyvern-v2.3", [
  "0x5b3256965e7c3cf26e11fcaf296dfc8807c01073",
  "0x8de9c5a032463c561423387a9648c5c7bcc5bc90",
  "0x0000a26b00c1f0df003000390027140000faa719",
]);

addPlatformAddress("looks-rare", ["0x5924a28caaf1cc016617874a2f0c3710d881f3c1"]);
addPlatformAddress("x2y2", [Sdk.X2Y2.Addresses.FeeManager[config.chainId]]);
addPlatformAddress("foundation", ["0x67df244584b67e8c51b10ad610aaffa9a402fdb6"]);
addPlatformAddress("superrare", [Sdk.SuperRare.Addresses.Treasury[config.chainId]]);
addPlatformAddress("sudoswap", [
  "0x4e2f98c96e2d595a83afa35888c4af58ac343e44",
  "0xb16c1342e617a5b6e4b631eb114483fdb289c0a4",
]);
addPlatformAddress("bend-dao", ["0xf3ab1d58ce6b9e0d42b8958c918649305e1b1d26"]);

addPlatformAddress("godid", ["0xe89b80d335a643495cfcf004037a381565edc130"]);

// List of supported exchanges
export const supportedExchanges: Map<OrderKind, string> = new Map();
supportedExchanges.set("blur", Sdk.Blur.Addresses.Exchange[config.chainId]);
supportedExchanges.set("seaport", Sdk.SeaportV11.Addresses.Exchange[config.chainId]);
supportedExchanges.set("seaport-v1.4", Sdk.SeaportV14.Addresses.Exchange[config.chainId]);
supportedExchanges.set("alienswap", Sdk.Alienswap.Addresses.Exchange[config.chainId]);
supportedExchanges.set("x2y2", Sdk.X2Y2.Addresses.Exchange[config.chainId]);
supportedExchanges.set("looks-rare", Sdk.LooksRare.Addresses.Exchange[config.chainId]);
supportedExchanges.set("wyvern-v2", Sdk.WyvernV2.Addresses.Exchange[config.chainId]);
supportedExchanges.set("wyvern-v2.3", Sdk.WyvernV23.Addresses.Exchange[config.chainId]);
