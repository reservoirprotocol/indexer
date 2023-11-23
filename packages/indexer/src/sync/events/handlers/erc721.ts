import { logger } from "@/common/logger";
import { getNetworkSettings } from "@/config/network";
import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import { BaseEventParams } from "@/events-sync/parser";
import { processConsecutiveTransferJob } from "@/jobs/events-sync/process-consecutive-transfer";
import { handleMints } from "@/events-sync/handlers/utils/erc721";

export const handleEvents = async (events: EnhancedEvent[], onChainData: OnChainData) => {
  // For handling mints as sales
  const mintedTokens = new Map<
    string,
    {
      contract: string;
      from: string;
      to: string;
      tokenId: string;
      amount: string;
      baseEventParams: BaseEventParams;
    }[]
  >();

  // Cache the network settings
  const ns = getNetworkSettings();

  // Handle the events
  for (const { subKind, baseEventParams, log } of events) {
    const eventData = getEventData([subKind])[0];
    switch (subKind) {
      case "erc721-transfer":
      case "erc721-like-transfer":
      case "erc721-erc20-like-transfer": {
        const parsedLog = eventData.abi.parseLog(log);
        const from = parsedLog.args["from"].toLowerCase();
        const to = parsedLog.args["to"].toLowerCase();
        const tokenId = parsedLog.args["tokenId"].toString();

        onChainData.nftTransferEvents.push({
          kind: subKind === "erc721-transfer" ? "erc721" : "erc721-like",
          from,
          to,
          tokenId,
          amount: "1",
          baseEventParams,
        });

        // Make sure to only handle the same data once per transaction
        const contextPrefix = `${baseEventParams.txHash}-${baseEventParams.address}-${tokenId}`;

        onChainData.makerInfos.push({
          context: `${contextPrefix}-${from}-sell-balance`,
          maker: from,
          trigger: {
            kind: "balance-change",
            txHash: baseEventParams.txHash,
            txTimestamp: baseEventParams.timestamp,
          },
          data: {
            kind: "sell-balance",
            contract: baseEventParams.address,
            tokenId,
          },
        });

        onChainData.makerInfos.push({
          context: `${contextPrefix}-${to}-sell-balance`,
          maker: to,
          trigger: {
            kind: "balance-change",
            txHash: baseEventParams.txHash,
            txTimestamp: baseEventParams.timestamp,
          },
          data: {
            kind: "sell-balance",
            contract: baseEventParams.address,
            tokenId,
          },
        });

        if (ns.mintAddresses.includes(from)) {
          onChainData.mintInfos.push({
            contract: baseEventParams.address,
            tokenId,
            mintedTimestamp: baseEventParams.timestamp,
          });
          onChainData.mints.push({
            by: "tx",
            data: {
              txHash: baseEventParams.txHash,
            },
          });

          if (!ns.mintsAsSalesBlacklist.includes(baseEventParams.address)) {
            if (!mintedTokens.has(baseEventParams.txHash)) {
              mintedTokens.set(baseEventParams.txHash, []);
            }
            mintedTokens.get(baseEventParams.txHash)!.push({
              contract: baseEventParams.address,
              tokenId,
              from,
              to,
              amount: "1",
              baseEventParams,
            });
          }
        }

        break;
      }

      case "erc721-consecutive-transfer": {
        const parsedLog = eventData.abi.parseLog(log);
        const from = parsedLog.args["fromAddress"].toLowerCase();
        const to = parsedLog.args["toAddress"].toLowerCase();
        const fromTokenId = parsedLog.args["fromTokenId"].toString();
        const toTokenId = parsedLog.args["toTokenId"].toString();

        const fromNumber = Number(fromTokenId);
        const toNumber = Number(toTokenId);

        // For safety, skip consecutive transfers over 100000, 100 to 100000 process in batches, under 100 process normally
        if (toNumber - fromNumber > 100000) {
          logger.info(
            "erc721-handler",
            `Skipping large consecutive-transfer range (size = ${toNumber - fromNumber}) for tx (${
              baseEventParams.txHash
            })`
          );
        } else if (toNumber - fromNumber > 100) {
          logger.info(
            "erc721-handler",
            `consecutive-transfer detected range (size = ${toNumber - fromNumber}) for tx (${
              baseEventParams.txHash
            })`
          );

          await processConsecutiveTransferJob.addToQueue(log, baseEventParams);
          break;
        }

        for (let i = fromNumber; i <= toNumber; i++) {
          const tokenId = i.toString();

          onChainData.nftTransferEvents.push({
            kind: "erc721",
            from,
            to,
            tokenId,
            amount: "1",
            baseEventParams: {
              ...baseEventParams,
              batchIndex: baseEventParams.batchIndex + (i - fromNumber),
            },
          });

          if (ns.mintAddresses.includes(from)) {
            onChainData.mintInfos.push({
              contract: baseEventParams.address,
              tokenId,
              mintedTimestamp: baseEventParams.timestamp,
            });
            onChainData.mints.push({
              by: "tx",
              data: {
                txHash: baseEventParams.txHash,
              },
            });

            if (!ns.mintsAsSalesBlacklist.includes(baseEventParams.address)) {
              if (!mintedTokens.has(baseEventParams.txHash)) {
                mintedTokens.set(baseEventParams.txHash, []);
              }
              mintedTokens.get(baseEventParams.txHash)!.push({
                contract: baseEventParams.address,
                tokenId,
                from,
                to,
                amount: "1",
                baseEventParams,
              });
            }
          }

          // Skip pushing to `makerInfos` since that could result in "out-of-memory" errors
        }

        break;
      }

      case "erc721/1155-approval-for-all": {
        const parsedLog = eventData.abi.parseLog(log);
        const owner = parsedLog.args["owner"].toLowerCase();
        const operator = parsedLog.args["operator"].toLowerCase();
        const approved = parsedLog.args["approved"];

        onChainData.nftApprovalEvents.push({
          owner,
          operator,
          approved,
          baseEventParams,
        });

        // Make sure to only handle the same data once per transaction
        const contextPrefix = `${baseEventParams.txHash}-${baseEventParams.address}-${baseEventParams.logIndex}`;

        onChainData.makerInfos.push({
          context: `${contextPrefix}-${owner}-sell-approval`,
          maker: owner,
          trigger: {
            kind: "approval-change",
            txHash: baseEventParams.txHash,
            txTimestamp: baseEventParams.timestamp,
          },
          data: {
            kind: "sell-approval",
            contract: baseEventParams.address,
            operator,
          },
        });

        break;
      }
    }
  }

  await handleMints(mintedTokens, onChainData);
};
