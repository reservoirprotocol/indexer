import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";

export const handleEvents = async (events: EnhancedEvent[], onChainData: OnChainData) => {
  for (const { subKind, log } of events) {
    const eventData = getEventData([subKind])[0];
    switch (subKind) {
      case "createdotfun-configuration-updated": {
        const parsedLog = eventData.abi.parseLog(log);
        const collection = parsedLog.args["contract"].toLowerCase();

        onChainData.mints.push({
          by: "collection",
          data: {
            standard: "createdotfun",
            collection,
          },
        });

        break;
      }
    }
  }
};
