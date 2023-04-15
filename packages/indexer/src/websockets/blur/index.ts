import * as Sdk from "@reservoir0x/sdk";
import { io } from "socket.io-client";

import { logger } from "@/common/logger";
import { config } from "@/config/index";
import * as orderbook from "@/jobs/orderbook/orders-queue";
import * as blurBidsRefresh from "@/jobs/order-updates/misc/blur-bids-refresh";

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

  client.on("CollectionBidsPrice", async (message: string) => {
    try {
      const parsedMessage: {
        contractAddress: string;
        updates: Sdk.Blur.Types.BlurBidPricePoint[];
      } = JSON.parse(message);

      logger.info(COMPONENT, JSON.stringify(parsedMessage));

      const collection = parsedMessage.contractAddress.toLowerCase();
      await orderbook.addToQueue([
        {
          kind: "blur-bid",
          info: {
            orderParams: {
              collection,
              pricePoints: parsedMessage.updates,
            },
            metadata: {},
          },
        },
      ]);

      await blurBidsRefresh.addToQueue(collection);
    } catch (error) {
      logger.error(COMPONENT, `Error handling bid: ${error} (message = ${message})`);
    }
  });
}
