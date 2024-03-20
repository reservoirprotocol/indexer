import _ from "lodash";

import { bn } from "@/common/utils";
import { config } from "@/config/index";
import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import { metadataIndexFetchJob } from "@/jobs/metadata-index/metadata-fetch-job";
import { onchainMetadataProvider } from "@/metadata/providers/onchain-metadata-provider";
import { Collections } from "@/models/collections";
import { logger } from "@/common/logger";

export const handleEvents = async (events: EnhancedEvent[], onChainData: OnChainData) => {
  // Handle the events
  try {
    for (const { subKind, baseEventParams, log } of events) {
      const eventData = getEventData([subKind])[0];

      // Skip opensea subkinds if chainId === 1
      if (config.chainId === 1 && subKind.includes("opensea")) {
        continue;
      }

      const collection = await Collections.getById(baseEventParams.address.toLowerCase());

      switch (subKind) {
        case "metadata-update-single-token-opensea": {
          const parsedLog = eventData.abi.parseLog(log);
          if (!parsedLog.args["tokenId"]) {
            break;
          }
          const tokenId = parsedLog.args["tokenId"]?.toString();

          // Trigger a refresh for token of tokenId and baseEventParams.address
          logger.info(
            "metadata-update-event",
            `Triggering metadata update for token ${tokenId} of collection ${baseEventParams.address.toLowerCase()}`
          );
          await metadataIndexFetchJob.addToQueue(
            [
              {
                kind: "single-token",
                data: {
                  method: metadataIndexFetchJob.getIndexingMethod(collection),
                  collection: baseEventParams.address.toLowerCase(),
                  contract: baseEventParams.address.toLowerCase(),
                  tokenId: tokenId,
                },
                context: "onchain-metadata-update-single-token",
              },
            ],
            true,
            15
          );
          break;
        }

        case "metadata-update-batch-tokens-opensea": {
          const parsedLog = eventData.abi.parseLog(log);
          if (!parsedLog.args["_fromTokenId"] || !parsedLog.args["_toTokenId"]) {
            break;
          }
          const fromToken = parsedLog.args["_fromTokenId"].toString();
          const toToken = parsedLog.args["_toTokenId"].toString();

          // If _toToken = type(uint256).max, then this is just a collection refresh

          if (toToken === bn(2).pow(256).sub(1).toString()) {
            // Trigger a refresh for all tokens of baseEventParams.address
            logger.info(
              "metadata-update-event",
              `Triggering metadata update for all tokens of collection ${baseEventParams.address.toLowerCase()}`
            );
            await metadataIndexFetchJob.addToQueue(
              [
                {
                  kind: "full-collection",
                  data: {
                    method: metadataIndexFetchJob.getIndexingMethod(collection),
                    collection: baseEventParams.address.toLowerCase(),
                  },
                  context: "onchain-metadata-update-batch-tokens",
                },
              ],
              true,
              15
            );
          } else {
            // Trigger a refresh for all tokens  fromToken to toToken of baseEventParams.address

            // Don't do this if the amount of tokens is bigger than maxTokenSetSize
            if (parseInt(toToken) - parseInt(fromToken) > config.maxTokenSetSize) {
              break;
            }

            logger.info(
              "metadata-update-event",
              `Triggering metadata update for tokens ${fromToken} to ${toToken} of collection ${baseEventParams.address.toLowerCase()}`
            );

            await metadataIndexFetchJob.addToQueue(
              _.range(parseInt(fromToken), parseInt(toToken) + 1).map((tokenId) => ({
                kind: "single-token",
                data: {
                  method: metadataIndexFetchJob.getIndexingMethod(collection),
                  collection: baseEventParams.address.toLowerCase(),
                  contract: baseEventParams.address.toLowerCase(),
                  tokenId: tokenId.toString(),
                },
                context: "onchain-metadata-update-batch-tokens",
              })),
              true,
              15
            );
          }

          break;
        }

        case "metadata-update-uri-opensea":
        case "metadata-update-zora":
        case "metadata-update-contract-uri-thirdweb": {
          logger.info(
            "metadata-update-event",
            `Triggering metadata update for all tokens of collection ${baseEventParams.address.toLowerCase()}`
          );
          await metadataIndexFetchJob.addToQueue(
            [
              {
                kind: "full-collection",
                data: {
                  method: metadataIndexFetchJob.getIndexingMethod(collection),
                  collection: baseEventParams.address.toLowerCase(),
                },
                context: "onchain-metadata-update-batch-tokens",
              },
            ],
            true,
            15
          );

          break;
        }

        case "metadata-update-mint-config-changed": {
          const rawMetadata = await onchainMetadataProvider.getContractURI(baseEventParams.address);
          logger.info(
            "metadata-update-event",
            `Triggering metadata update for all tokens of collection ${baseEventParams.address.toLowerCase()}`
          );
          onChainData.mints.push({
            by: "contractMetadata",
            data: {
              collection: baseEventParams.address.toLowerCase(),
              metadata: rawMetadata,
            },
          });

          break;
        }
      }
    }
  } catch (error) {
    logger.error("metadata-update-event", `Error handling events: ${error}`);
  }
};
