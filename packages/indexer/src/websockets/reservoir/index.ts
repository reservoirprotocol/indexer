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

        const ts2 = new Date(eventData.timestamp * 1000);
        const ts3 = new Date(eventData.createdAt);
        const ts4 = new Date(messageJson.published_at);
        const ts5 = new Date();

        logger.info(
          "reservoir-websocket",
          JSON.stringify({
            topic: "debugMissingTokenNormalizedFloorAskChangedEvents",
            message: `receivedEvent. collectionId=${eventData.collection?.id},  contract=${eventData.contract}, tokenId=${eventData.tokenId}`,
            collectionId: eventData.collection?.id,
            contract: eventData.contract,
            tokenId: eventData.tokenId,
            txHash: eventData.txHash,
            eventData,
            timestamps: {
              ts2: ts2.toISOString(),
              ts3: ts3.toISOString(),
              ts4: ts4.toISOString(),
              ts5: ts5.toISOString(),
            },
            latencies: {
              ts2ts3LatencyMs: ts3.getTime() - ts2.getTime(),
              ts3ts4LatencyMs: ts4.getTime() - ts3.getTime(),
              ts4ts5LatencyMs: ts5.getTime() - ts4.getTime(),
              ts3ts5LatencyMs: ts5.getTime() - ts3.getTime(),
              ts2ts5LatencyMs: ts5.getTime() - ts2.getTime(),
            },
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
