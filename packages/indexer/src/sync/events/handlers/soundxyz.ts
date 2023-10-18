import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";

export const handleEvents = async (events: EnhancedEvent[], onChainData: OnChainData) => {
  // Handle the events
  for (const { subKind, log, baseEventParams } of events) {
    const eventData = getEventData([subKind])[0];
    switch (subKind) {
      case "soundxyz-merkle-drop-mint-created":
      case "soundxyz-range-edition-mint-created": {
        const parsedLog = eventData.abi.parseLog(log);
        const collection = parsedLog.args["edition"].toLowerCase();
        const mintId = parsedLog.args["mintId"].toString();
        const minter = baseEventParams.address.toString();

        onChainData.mints.push({
          by: "collection",
          data: {
            standard: "soundxyz",
            collection: collection,
            additionalInfo: {
              mintId,
              minter,
            },
          },
        });

        break;
      }
    }
  }
};
