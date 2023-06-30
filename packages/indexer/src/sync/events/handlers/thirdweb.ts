import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";

export const handleEvents = async (events: EnhancedEvent[], onChainData: OnChainData) => {
  // Handle the events
  for (const { subKind, baseEventParams, log } of events) {
    const eventData = getEventData([subKind])[0];
    switch (subKind) {
      case "thirdweb-claim-conditions-updated-erc721": {
        onChainData.mints.push({
          by: "collection",
          data: {
            standard: "thirdweb",
            collection: baseEventParams.address,
          },
        });

        break;
      }

      case "thirdweb-claim-conditions-updated-erc1155": {
        const { args } = eventData.abi.parseLog(log);

        onChainData.mints.push({
          by: "collection",
          data: {
            standard: "thirdweb",
            collection: baseEventParams.address,
            tokenId: args["tokenId"].toString(),
          },
        });

        break;
      }
    }
  }
};
