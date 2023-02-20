import { Log } from "@ethersproject/abstract-provider";

import { getEventData } from "@/events-sync/data";

export const getERC20Transfer = (logs: Log[]) => {
  for (const log of logs) {
    const erc20EventData = getEventData(["erc20-transfer"])[0];
    const address = log.address.toLowerCase();
    if (
      log.topics[0] === erc20EventData.topic &&
      log.topics.length === erc20EventData.numTopics &&
      erc20EventData.addresses?.[address]
    ) {
      return address;
    }
  }
};
