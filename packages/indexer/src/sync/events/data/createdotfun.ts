import { Interface } from "@ethersproject/abi";

import { EventData } from "@/events-sync/data";

export const configurationUpdated: EventData = {
  kind: "createdotfun",
  subKind: "createdotfun-configuration-updated",
  topic: "0x347dcf024ff81ae3ee3e6af91c3857828fc485ff63fa538cd22952fe2d7f836c",
  numTopics: 2,
  abi: new Interface([
    `event ConfigurationUpdated(
      address indexed contract,
      (
        uint256 price,
        uint64 mintStart,
        uint64 mintEnd,
        uint32 maxPerWallet,
        uint32 maxPerTransaction,
        uint32 maxForModule,
        uint32 maxSupply
      ) config
    )`,
  ]),
};
