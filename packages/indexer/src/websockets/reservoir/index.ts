import WebSocket from "ws";
import { config } from "@/config/index";
import { logger } from "@/common/logger";

if (
  [1, 11155111].includes(config.chainId) &&
  config.doWebsocketWork &&
  config.debugApiKeys.length
) {
  const wsUrl = `wss://ws${
    config.environment === "dev" ? ".dev" : config.chainId === 11155111 ? "-sepolia" : ""
  }.reservoir.tools?api_key=${config.debugApiKeys[0]}`;

  const ws = new WebSocket(wsUrl);

  logger.info(
    "reservoir-websocket",
    JSON.stringify({
      topic: "debugMissingSaleWsEvents",
      message: `WebSocket connection start`,
    })
  );

  ws.on("open", () => {
    logger.info(
      "reservoir-websocket",
      JSON.stringify({
        topic: "debugMissingSaleWsEvents",
        message: "WebSocket connection established",
      })
    );

    ws.on("message", (data: WebSocket.Data) => {
      const message = data.toString();
      const messageJson = JSON.parse(message);

      logger.info(
        "reservoir-websocket",
        JSON.stringify({
          topic: "debugMissingSaleWsEvents",
          message: `Received message: ${message}`,
        })
      );

      if (messageJson.status === "ready") {
        ws.send(
          JSON.stringify({
            type: "subscribe",
            event: "sale.created",
          })
        );
      } else if (messageJson.event === "sale.created") {
        const eventData = messageJson.data;

        const ts2 = new Date(eventData.timestamp * 1000);
        const ts3 = new Date(eventData.createdAt);
        const ts4 = new Date(messageJson.published_at);
        const ts5 = new Date();

        logger.info(
          "reservoir-websocket",
          JSON.stringify({
            topic: "debugMissingSaleWsEvents",
            message: `receivedSaleEvent. saleId=${eventData.id}`,
            saleId: eventData.id,
            saleTimestamp: eventData.timestamp,
            txHash: eventData.txHash,
            ts2: ts2.toISOString(),
            ts3: ts3.toISOString(),
            ts4: ts4.toISOString(),
            ts5: ts5.toISOString(),
            ts2ts3LatencyMs: ts3.getTime() - ts2.getTime(),
            ts3ts4LatencyMs: ts4.getTime() - ts3.getTime(),
            ts4ts5LatencyMs: ts5.getTime() - ts4.getTime(),
            ts3ts5LatencyMs: ts5.getTime() - ts3.getTime(),
            totalLatencyMs: ts5.getTime() - ts2.getTime(),
          })
        );
      }
    });
  });

  ws.on("close", (code: number, reason: string) => {
    logger.info(
      "reservoir-websocket",
      JSON.stringify({
        topic: "debugMissingSaleWsEvents",
        message: `WebSocket connection closed. code=${code}, reason=${reason}, wsUrl=${wsUrl}`,
      })
    );
  });

  ws.on("error", (error: Error) => {
    logger.error(
      "reservoir-websocket",
      JSON.stringify({
        topic: "debugMissingSaleWsEvents",
        message: `WebSocket error. error=${error.message}, wsUrl=${wsUrl}`,
      })
    );
  });
}
