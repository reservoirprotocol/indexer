import { Interface } from "@ethersproject/abi";
import { Rarible } from "@reservoir0x/sdk";

import { config } from "@/config/index";
import { EventData } from "@/events-sync/data";

export const match: EventData = {
  kind: "rarible",
  subKind: "rarible-match",
  addresses: { [Rarible.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x956cd63ee4cdcd81fda5f0ec7c6c36dceda99e1b412f4a650a5d26055dc3c450",
  numTopics: 1,
  abi: new Interface([
    `event Match(
      bytes32 leftHash,
      bytes32 rightHash,
      uint newLeftFill,
      uint newRightFill)
    `,
  ]),
};

export const cancel: EventData = {
  kind: "rarible",
  subKind: "rarible-cancel",
  addresses: { [Rarible.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0xe8d9861dbc9c663ed3accd261bbe2fe01e0d3d9e5f51fa38523b265c7757a93a",
  numTopics: 1,
  abi: new Interface([`event Cancel(bytes32 hash)`]),
};
