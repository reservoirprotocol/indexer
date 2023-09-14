import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";

export const handleEvents = async (events: EnhancedEvent[], onChainData: OnChainData) => {
  // Handle the events
  for (const { subKind, log } of events) {
    const eventData = getEventData([subKind])[0];
    switch (subKind) {
      case "seadrop-public-drop-updated": {
        const parsedLog = eventData.abi.parseLog(log);
        const collection = parsedLog.args["nftContract"].toLowerCase();

        onChainData.mints.push({
          by: "collection",
          data: {
            standard: "seadrop-v1.0",
            collection: collection,
          },
        });

        break;
      }
    }
  }
};
