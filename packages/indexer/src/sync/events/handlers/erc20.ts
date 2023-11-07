import { AddressZero } from "@ethersproject/constants";

import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";

export const handleEvents = async (events: EnhancedEvent[], onChainData: OnChainData) => {
  // Handle the events
  for (const { subKind, baseEventParams, log } of events) {
    const eventData = getEventData([subKind])[0];
    switch (subKind) {
      case "erc20-transfer": {
        const parsedLog = eventData.abi.parseLog(log);
        const from = parsedLog.args["from"].toLowerCase();
        const to = parsedLog.args["to"].toLowerCase();
        const amount = parsedLog.args["amount"].toString();

        onChainData.ftTransferEvents.push({
          from,
          to,
          amount,
          baseEventParams,
        });

        // Make sure to only handle the same data once per transaction
        const contextPrefix = `${baseEventParams.txHash}-${baseEventParams.address}`;

        onChainData.makerInfos.push({
          context: `${contextPrefix}-${from}-buy-balance`,
          maker: from,
          trigger: {
            kind: "balance-change",
            txHash: baseEventParams.txHash,
            txTimestamp: baseEventParams.timestamp,
          },
          data: {
            kind: "buy-balance",
            contract: baseEventParams.address,
          },
        });

        onChainData.makerInfos.push({
          context: `${contextPrefix}-${to}-buy-balance`,
          maker: to,
          trigger: {
            kind: "balance-change",
            txHash: baseEventParams.txHash,
            txTimestamp: baseEventParams.timestamp,
          },
          data: {
            kind: "buy-balance",
            contract: baseEventParams.address,
          },
        });

        break;
      }

      case "erc20-approval": {
        const parsedLog = eventData.abi.parseLog(log);
        const owner = parsedLog.args["owner"].toLowerCase();
        const spender = parsedLog.args["spender"].toLowerCase();

        // Make sure to only handle the same data once per transaction
        const contextPrefix = `${baseEventParams.txHash}-${baseEventParams.address}`;

        onChainData.makerInfos.push({
          context: `${contextPrefix}-${owner}-${spender}-buy-approval`,
          maker: owner,
          trigger: {
            kind: "approval-change",
            txHash: baseEventParams.txHash,
            txTimestamp: baseEventParams.timestamp,
          },
          data: {
            kind: "buy-approval",
            contract: baseEventParams.address,
            operator: spender,
          },
        });

        // Recheck every permit that could have been affected
        onChainData.permitInfos.push({
          kind: "eip2612",
          owner,
          spender,
          token: baseEventParams.address,
        });

        break;
      }

      case "weth-deposit": {
        const parsedLog = eventData.abi.parseLog(log);
        const to = parsedLog.args["to"].toLowerCase();
        const amount = parsedLog.args["amount"].toString();

        onChainData.ftTransferEvents.push({
          from: AddressZero,
          to,
          amount,
          baseEventParams,
        });

        // Make sure to only handle the same data once per transaction
        const contextPrefix = `${baseEventParams.txHash}-${baseEventParams.address}`;

        onChainData.makerInfos.push({
          context: `${contextPrefix}-${to}-buy-balance`,
          maker: to,
          trigger: {
            kind: "balance-change",
            txHash: baseEventParams.txHash,
            txTimestamp: baseEventParams.timestamp,
          },
          data: {
            kind: "buy-balance",
            contract: baseEventParams.address,
          },
        });

        break;
      }

      case "weth-withdrawal": {
        const parsedLog = eventData.abi.parseLog(log);
        const from = parsedLog.args["from"].toLowerCase();
        const amount = parsedLog.args["amount"].toString();

        onChainData.ftTransferEvents.push({
          from,
          to: AddressZero,
          amount,
          baseEventParams,
        });

        // Make sure to only handle the same data once per transaction
        const contextPrefix = `${baseEventParams.txHash}-${baseEventParams.address}`;

        onChainData.makerInfos.push({
          context: `${contextPrefix}-${from}-buy-balance`,
          maker: from,
          trigger: {
            kind: "balance-change",
            txHash: baseEventParams.txHash,
            txTimestamp: baseEventParams.timestamp,
          },
          data: {
            kind: "buy-balance",
            contract: baseEventParams.address,
          },
        });

        break;
      }
    }
  }
};
