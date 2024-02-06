import { getEventData } from "@/events-sync/data";
import { EnhancedEvent } from "@/events-sync/handlers/utils";
import * as erc721c from "@/utils/erc721c/index";

export const handleEvents = async (events: EnhancedEvent[]) => {
  for (const { subKind, baseEventParams, log } of events) {
    const eventData = getEventData([subKind])[0];
    switch (subKind) {
      case "erc721c-v2-applied-list-to-collection":
      case "erc721c-v2-set-transfer-security-level": {
        const parsedLog = eventData.abi.parseLog(log);
        const collection = parsedLog.args["collection"].toLowerCase();

        await erc721c.v2.refreshConfig(collection);
        break;
      }

      case "erc721c-v2-transfer-validator-updated": {
        await erc721c.v2.refreshConfig(baseEventParams.address);
        break;
      }

      case "erc721c-v2-removed-account-from-list":
      case "erc721c-v2-removed-code-hash-from-list":
      case "erc721c-v2-added-account-to-list":
      case "erc721c-v2-added-code-hash-to-list": {
        const parsedLog = eventData.abi.parseLog(log);
        const id = parsedLog.args["id"].toString();
        const transferValidator = baseEventParams.address.toLowerCase();

        parsedLog.args.kind === 0
          ? await erc721c.v2.refreshBlacklist(transferValidator, id)
          : await erc721c.v2.refreshWhitelist(transferValidator, id);

        break;
      }
    }
  }
};
