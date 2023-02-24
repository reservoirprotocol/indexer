import * as Sdk from "@reservoir0x/sdk";
import { OrderKind } from "@/orderbook/orders";
import { config } from "@/config/index";

export const platformFeeRecipientsRegistry: Map<string, string[]> = new Map();
export const allPlatformFeeRecipients = new Set();
export const allExchangeList: Map<OrderKind, string> = new Map();

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

addPlatformAddress("looks-rare", ["0x5924a28caaf1cc016617874a2f0c3710d881f3c1"]);
addPlatformAddress("x2y2", [Sdk.X2Y2.Addresses.FeeManager[config.chainId]]);
addPlatformAddress("foundation", ["0x67df244584b67e8c51b10ad610aaffa9a402fdb6"]);
addPlatformAddress("infinity", [Sdk.Infinity.Addresses.Exchange[config.chainId]]);
addPlatformAddress("sudoswap", ["0x4e2f98c96e2d595a83afa35888c4af58ac343e44"]);

// Exchange List
allExchangeList.set("seaport", Sdk.Seaport.Addresses.Exchange[config.chainId]);
allExchangeList.set("seaport-v1.4", Sdk.SeaportV14.Addresses.Exchange[config.chainId]);
allExchangeList.set("x2y2", Sdk.X2Y2.Addresses.Exchange[config.chainId]);
allExchangeList.set("looks-rare", Sdk.LooksRare.Addresses.Exchange[config.chainId]);
