import { getEventData } from "@/events-sync/data";
import { EnhancedEvent } from "@/events-sync/handlers/utils";
import * as erc721c from "@/utils/erc721c/index";

export const handleEvents = async (events: EnhancedEvent[]) => {
  for (const { subKind, baseEventParams, log } of events) {
    const eventData = getEventData([subKind])[0];
    switch (subKind) {
      case "erc721c-verified-eoa-signature": {
        const parsedLog = eventData.abi.parseLog(log);
        const transferValidator = baseEventParams.address.toLowerCase();
        const address = parsedLog.args["account"].toLowerCase();

        await erc721c.saveVerifiedEOA(transferValidator, address);

        break;
      }

      case "erc721c-set-allowlist":
      case "erc721c-set-transfer-security-level": {
        const parsedLog = eventData.abi.parseLog(log);
        const collection = parsedLog.args["collection"].toLowerCase();

        await erc721c.v1.refreshConfig(collection);
        break;
      }

      case "erc721c-transfer-validator-updated": {
        await erc721c.v1.refreshConfig(baseEventParams.address);
        break;
      }

      case "erc721c-removed-from-allowlist":
      case "erc721c-added-to-allowlist": {
        const parsedLog = eventData.abi.parseLog(log);
        const id = parsedLog.args["id"].toString();
        const transferValidator = baseEventParams.address.toLowerCase();

        parsedLog.args.kind === 0
          ? await erc721c.v1.refreshOperatorWhitelist(transferValidator, id)
          : await erc721c.v1.refreshPermittedContractReceiverAllowlist(transferValidator, id);

        break;
      }
    }
  }
};
