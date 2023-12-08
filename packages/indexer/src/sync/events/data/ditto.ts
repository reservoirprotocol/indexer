import { Interface } from "@ethersproject/abi";

import { EventData } from "@/events-sync/data";

export const dittoPoolInitialized: EventData = {
  kind: "ditto",
  subKind: "ditto-pool-initialized",
  topic: "0x1a09ea6cde50172776f5eec38a7369da704a85b3cfad138d4bbf52a036136f72",
  numTopics: 1,
  abi: new Interface([
    `event DittoPoolMainPoolInitialized(
      address template,
      address lpNft,
      address permitter
    )`,
  ]),
};
