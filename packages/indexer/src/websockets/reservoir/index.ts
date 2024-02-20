import WebSocket from "ws";
import { config } from "@/config/index";
import { logger } from "@/common/logger";
import { getNetworkName, getNetworkSettings } from "@/config/network";

if ([1, 11155111].includes(config.chainId) && config.doWebsocketWork && config.debugWsApiKey) {
  const wsUrl = `wss://ws${
    config.environment === "dev" ? ".dev" : config.chainId === 1 ? "" : `-${getNetworkName()}`
  }.reservoir.tools?api_key=${config.debugWsApiKey}`;

  const ws = new WebSocket(wsUrl);

  logger.info(
    "reservoir-websocket",
    JSON.stringify({
      topic: "debugMissingTokenNormalizedFloorAskChangedEvents",
      message: `WebSocket connection start`,
    })
  );

  ws.on("open", () => {
    logger.info(
      "reservoir-websocket",
      JSON.stringify({
        topic: "debugMissingTokenNormalizedFloorAskChangedEvents",
        message: "WebSocket connection established",
      })
    );

    ws.on("message", (data: WebSocket.Data) => {
      const message = data.toString();
      const messageJson = JSON.parse(message);

      if (messageJson.status === "ready") {
        ws.send(
          JSON.stringify({
            type: "subscribe",
            event: "token.updated",
            changed: "market.floorAskNormalized.id",
            filters: {
              contract: getNetworkSettings().multiCollectionContracts,
            },
          })
        );
      } else if (messageJson.event === "token.updated") {
        const eventData = messageJson.data;

        logger.info(
          "reservoir-websocket",
          JSON.stringify({
            topic: "debugMissingTokenNormalizedFloorAskChangedEvents",
            message: `receivedEvent. collectionId=${eventData.collection?.id},  contract=${eventData.contract}, tokenId=${eventData.tokenId}`,
            collectionId: eventData.collection?.id,
            contract: eventData.contract,
            tokenId: eventData.tokenId,
            eventData: JSON.stringify(eventData),
          })
        );
      }
    });
  });

  ws.on("close", (code: number, reason: string) => {
    logger.info(
      "reservoir-websocket",
      JSON.stringify({
        topic: "debugMissingTokenNormalizedFloorAskChangedEvents",
        message: `WebSocket connection closed. code=${code}, reason=${reason}, wsUrl=${wsUrl}`,
      })
    );
  });

  ws.on("error", (error: Error) => {
    logger.error(
      "reservoir-websocket",
      JSON.stringify({
        topic: "debugMissingTokenNormalizedFloorAskChangedEvents",
        message: `WebSocket error. error=${error.message}, wsUrl=${wsUrl}`,
      })
    );
  });
}
