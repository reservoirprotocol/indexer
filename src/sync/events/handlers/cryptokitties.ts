import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import { AddressZero } from "@ethersproject/constants";

import * as es from "@/events-sync/storage";
import * as tokenUpdatesMint from "@/jobs/token-updates/mint-queue";

export const handleEvents = async (events: EnhancedEvent[]): Promise<OnChainData> => {
  const nftTransferEvents: es.nftTransfers.Event[] = [];

  const mintInfos: tokenUpdatesMint.MintInfo[] = [];

  // Handle the events
  for (const { kind, baseEventParams, log } of events) {
    const eventData = getEventData([kind])[0];
    switch (kind) {
      case "cryptokitties-transfer": {
        const { args } = eventData.abi.parseLog(log);
        const from = args["from"].toLowerCase();
        const to = args["to"].toLowerCase();
        const tokenId = args["tokenId"].toString();

        nftTransferEvents.push({
          kind: "cryptokitties",
          from,
          to,
          tokenId,
          amount: "1",
          baseEventParams,
        });

        if (from === AddressZero) {
          mintInfos.push({
            contract: baseEventParams.address,
            tokenId,
            mintedTimestamp: baseEventParams.timestamp,
          });
        }

        break;
      }
    }
  }

  return {
    nftTransferEvents,
    mintInfos,
  };
};
