import * as Sdk from "@reservoir0x/sdk";
import { io } from "socket.io-client";

import { logger } from "@/common/logger";
import { config } from "@/config/index";
import * as orderbook from "@/jobs/orderbook/orders-queue";

const COMPONENT = "blur-websocket";

if (config.doWebsocketWork && config.blurWsUrl && config.blurWsApiKey) {
  const client = io(config.blurWsUrl, {
    extraHeaders: {
      "Api-Key": config.blurWsApiKey,
    },
  });

  client.on("connect", () => {
    logger.info(COMPONENT, "Connected to Blur via websocket");
  });

  client.on("connect_error", (error) => {
    logger.error(COMPONENT, `Error from Blur websocket: ${error}`);
  });

  client.on(
    "CollectionBidsPrice",
    async (message: { contractAddress: string; updates: Sdk.Blur.Types.BlurBidPricePoint[] }) => {
      try {
        logger.info(COMPONENT, JSON.stringify(message));
        if (message.contractAddress === "0x19b86299c21505cdf59ce63740b240a9c822b5e4") {
          await orderbook.addToQueue([
            {
              kind: "blur-bid",
              info: {
                orderParams: {
                  collection: message.contractAddress.toLowerCase(),
                  pricePoints: message.updates,
                },
                metadata: {},
              },
            },
          ]);
        }
      } catch (error) {
        logger.error(COMPONENT, `Error handling bid: ${error} (message = ${message})`);
      }
    }
  );
}
