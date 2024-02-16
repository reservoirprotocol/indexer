import { Interface } from "@ethersproject/abi";

import { EventData } from "@/events-sync/data";

export const editionCreated: EventData = {
  kind: "fairxyz",
  subKind: "fairxyz-edition-created",
  topic: "0xaf1874b81c219a8f1fd4020887b21deb5761445c77c2ad850b65c73038853548",
  numTopics: 2,
  abi: new Interface([
    `event EditionCreated(
      uint256 indexed editionId,
      uint256 externalId,
      (
        uint40 maxMintsPerWallet,
        uint40 maxSupply,
        bool burnable,
        bool signatureReleased,
        bool soulbound
      ) edition
    )`,
  ]),
};
