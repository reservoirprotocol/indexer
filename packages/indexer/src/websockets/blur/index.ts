import * as Sdk from "@reservoir0x/sdk";
import { io } from "socket.io-client";

import { logger } from "@/common/logger";
import { config } from "@/config/index";
import * as blurBidsBuffer from "@/jobs/order-updates/misc/blur-bids-buffer";
import * as blurListingsRefresh from "@/jobs/order-updates/misc/blur-listings-refresh";
import * as orderbook from "@/jobs/orderbook/orders-queue";

const COMPONENT = "blur-websocket";

if (config.doWebsocketWork && config.blurWsUrl && config.blurWsApiKey) {
  const client = io(config.blurWsUrl, {
    transports: ["websocket"],
    auth: {
      "api-key": config.blurWsApiKey,
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

      const collection = parsedMessage.contractAddress.toLowerCase();
      const pricePoints = parsedMessage.updates;
      await blurBidsBuffer.addToQueue(collection, pricePoints);
    } catch (error) {
      logger.error(COMPONENT, `Error handling bid: ${error} (message = ${message})`);
    }
  });

  client.on("newTopsOfBooks", async (message: string) => {
    try {
      const parsedMessage: {
        contractAddress: string;
        tops: {
          tokenId: string;
          topAsk: {
            amount: string;
            unit: string;
            createdAt: string;
            marketplace: string;
          } | null;
        }[];
      } = JSON.parse(message);

      const collection = parsedMessage.contractAddress.toLowerCase();
      const orderInfos = parsedMessage.tops.map((t) => ({
        kind: "blur-listing",
        info: {
          orderParams: {
            collection,
            tokenId: t.tokenId,
            price: t.topAsk?.marketplace === "BLUR" ? t.topAsk.amount : undefined,
            createdAt: t.topAsk?.marketplace === "BLUR" ? t.topAsk.createdAt : undefined,
          },
          metadata: {},
        },
        ingestMethod: "websocket",
      }));

      logger.info(COMPONENT, JSON.stringify({ message, parsedMessage, orderInfos }));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await orderbook.addToQueue(orderInfos as any);

      await blurListingsRefresh.addToQueue(collection);
    } catch (error) {
      logger.error(COMPONENT, `Error handling listing: ${error} (message = ${message})`);
    }
  });
}
