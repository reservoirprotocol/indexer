import * as Sdk from "@reservoir0x/sdk";

import { config } from "@/config/index";
import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";

export const handleEvents = async (events: EnhancedEvent[], onChainData: OnChainData) => {
  // Handle the events
  for (const { subKind, log } of events) {
    const eventData = getEventData([subKind])[0];
    switch (subKind) {
      case "artblocks-project-updated":
      case "artblocks-minter-registered":
      case "artblocks-minter-removed":
      case "artblocks-project-price-update":
      case "artblocks-project-currency-update":
      case "artblocks-project-set-auction-details": {
        const parsedLog = eventData.abi.parseLog(log);
        const projectId = parsedLog.args["projectId"];

        onChainData.mints.push({
          by: "collection",
          data: {
            standard: "artblocks",
            collection: Sdk.ArtBlocks.Addresses.Collection[config.chainId],
            additionalInfo: {
              projectId,
            },
          },
        });

        break;
      }
    }
  }
};
