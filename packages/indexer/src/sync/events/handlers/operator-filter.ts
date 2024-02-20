import { Interface } from "@ethersproject/abi";
import { Contract } from "@ethersproject/contracts";

import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { getEventData } from "@/events-sync/data";
import { EnhancedEvent } from "@/events-sync/handlers/utils";
import * as marketplaceBlacklists from "@/utils/marketplace-blacklists";

export const handleEvents = async (events: EnhancedEvent[]) => {
  for (const { subKind, baseEventParams, log } of events) {
    const eventData = getEventData([subKind])[0];
    switch (subKind) {
      case "operator-filter-operator-updated":
      case "operator-filter-subscription-updated": {
        const { args } = eventData.abi.parseLog(log);
        const registrant = args["registrant"].toLowerCase();

        try {
          logger.info("debug", JSON.stringify({ msg: `Refreshing royalties`, registrant, log }));

          const registry = new Contract(
            baseEventParams.address,
            new Interface(["function subscribers(address registrant) view returns (address[])"]),
            baseProvider
          );

          const subscribers: string[] = await registry.subscribers(registrant);
          await Promise.all(
            subscribers.map((subscriber) =>
              marketplaceBlacklists.updateMarketplaceBlacklist(subscriber.toLowerCase())
            )
          );
        } catch (error) {
          logger.info(
            "debug",
            JSON.stringify({
              msg: `Error refreshing royalties`,
              registrant,
              log,
              error,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              stack: (error as any).stack,
            })
          );
        }

        break;
      }
    }
  }
};
