import { getEventData } from "@/events-sync/data";
import { EnhancedEvent } from "@/events-sync/handlers/utils";
import { DittoPool, saveDittoPool } from "@/models/ditto-pools";

export const handleEvents = async (events: EnhancedEvent[]) => {
  for (const { subKind, baseEventParams, log } of events) {
    const eventData = getEventData([subKind])[0];
    switch (subKind) {
      case "ditto-pool-initialized": {
        const parsedLog = eventData.abi.parseLog(log);
        const poolAddress = baseEventParams.address.toLowerCase();
        const templateAddress = parsedLog.args["template"].toLowerCase();
        const lpNftAddress = parsedLog.args["lpNft"].toLowerCase();
        const permitterAddress = parsedLog.args["permitter"].toLowerCase();

        const dittoPool: DittoPool = {
          address: poolAddress,
          template: templateAddress,
          lpNft: lpNftAddress,
          permitter: permitterAddress,
        };
        await saveDittoPool(dittoPool);

        break;
      }
    }
  }
};
