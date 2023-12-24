import { Interface } from "@ethersproject/abi";

import { EventData } from "@/events-sync/data";

const abi = new Interface([
  `event EditionPublished(
    address indexed creator,
    address remixContractAddress,
    address creatorProceedRecipient,
    address derivativeFeeRecipient
  )`,
]);

export const editionPublished: EventData = {
  kind: "titlesxyz",
  subKind: "titlesxyz-edition-published",
  numTopics: 2,
  abi,
  topic: abi.getEventTopic(abi.getEvent("EditionPublished")),
};
