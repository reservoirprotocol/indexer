import WebSocket from "ws";
import { config } from "@/config/index";
import { logger } from "@/common/logger";

if (
  [1, 11155111].includes(config.chainId) &&
  config.doWebsocketWork &&
  config.debugApiKeys.length
) {
  const ws = new WebSocket(
    `wss://ws${config.chainId === 1 ? "" : ".dev"}.reservoir.tools?api_key=${
      config.debugApiKeys[0]
    }`
  );

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
  });

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

      logger.info(
        "reservoir-websocket",
        JSON.stringify({
          topic: "debugMissingSaleWsEvents",
          message: `publishWebsocketEvent. saleId=${eventData.id}`,
          saleId: eventData.id,
          saleTimestamp: eventData.timestamp,
          txHash: eventData.txHash,
        })
      );
    }
  });

  ws.on("close", (code: number, reason: string) => {
    logger.info(
      "reservoir-websocket",
      JSON.stringify({
        topic: "debugMissingSaleWsEvents",
        message: `WebSocket connection closed with code ${code} and reason: ${reason}`,
      })
    );
  });

  ws.on("error", (error: Error) => {
    logger.error(
      "reservoir-websocket",
      JSON.stringify({
        topic: "debugMissingSaleWsEvents",
        message: `WebSocket error: ${error.message}`,
      })
    );
  });
}
