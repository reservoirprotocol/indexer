import * as Sdk from "@reservoir0x/sdk";
import { config } from "@/config/index";

export const platformFeeRecipientsRegistry: Map<string, string[]> = new Map();

platformFeeRecipientsRegistry.set("seaport", [
  "0x5b3256965e7c3cf26e11fcaf296dfc8807c01073",
  "0x8de9c5a032463c561423387a9648c5c7bcc5bc90",
  "0x0000a26b00c1f0df003000390027140000faa719",
]);

platformFeeRecipientsRegistry.set("looks-rare", ["0x5924a28caaf1cc016617874a2f0c3710d881f3c1"]);
platformFeeRecipientsRegistry.set("x2y2", [Sdk.X2Y2.Addresses.FeeManager[config.chainId]]);
platformFeeRecipientsRegistry.set("foundation", ["0x67df244584b67e8c51b10ad610aaffa9a402fdb6"]);
platformFeeRecipientsRegistry.set("infinity", [Sdk.Infinity.Addresses.Exchange[config.chainId]]);
platformFeeRecipientsRegistry.set("sudoswap", ["0x4e2f98c96e2d595a83afa35888c4af58ac343e44"]);
