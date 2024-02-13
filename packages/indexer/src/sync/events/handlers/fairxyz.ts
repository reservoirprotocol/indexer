import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";

export const handleEvents = async (events: EnhancedEvent[], onChainData: OnChainData) => {
  // Handle the events
  for (const { subKind, log, baseEventParams } of events) {
    const eventData = getEventData([subKind])[0];
    switch (subKind) {
      case "fairxyz-edition-created": {
        const parsedLog = eventData.abi.parseLog(log);
        const editionId = parsedLog.args["editionId"].toString();
        onChainData.mints.push({
          by: "collection",
          data: {
            standard: "fairxyz",
            collection: baseEventParams.address.toLowerCase(),
            additionalInfo: {
              editionId,
            },
          },
        });

        break;
      }
    }
  }
};
