import {
  CollectionOfferEventPayload,
  EventType,
  ItemReceivedBidEventPayload,
  Network,
  OpenSeaStreamClient,
  TraitOfferEventPayload,
} from "@opensea/stream-js";
import { WebSocket } from "ws";
import { config } from "@/config/index";
import { logger } from "@/common/logger";
import { ItemListedEventPayload } from "@opensea/stream-js/dist/types";
import { handleEvent as handleItemListedEvent } from "@/websockets/opensea/handlers/item_listed";
import { handleEvent as handleItemReceivedBidEvent } from "@/websockets/opensea/handlers/item_received_bid";
import { handleEvent as handleCollectionOfferEvent } from "@/websockets/opensea/handlers/collection_offer";
import { handleEvent as handleTraitOfferEvent } from "@/websockets/opensea/handlers/trait_offer";

import { PartialOrderComponents } from "@/orderbook/orders/seaport";
import * as orderbookOrders from "@/jobs/orderbook/orders-queue";
import * as orders from "@/orderbook/orders";

if (config.doWebsocketWork && config.openSeaApiKey) {
  const network = config.chainId === 5 ? Network.TESTNET : Network.MAINNET;

  const client = new OpenSeaStreamClient({
    token: config.openSeaApiKey,
    network,
    connectOptions: {
      transport: WebSocket,
    },
    onError: async (error) => {
      logger.error("opensea-websocket", `network=${network}, error=${JSON.stringify(error)}`);
    },
  });

  client.connect();

  logger.info("opensea-websocket", `Connected to opensea ${network} stream API`);

  client.onEvents(
    "*",
    [
      EventType.ITEM_LISTED,
      // EventType.ITEM_RECEIVED_BID,
      EventType.COLLECTION_OFFER,
      // EventType.TRAIT_OFFER
    ],
    async (event) => {
      logger.info(
        "opensea-websocket",
        `onEvents. event_type=${event.event_type}, event=${JSON.stringify(event)}`
      );

      const orderParams = handleEvent(event.event_type as EventType, event.payload);

      if (orderParams) {
        const orderInfo: orderbookOrders.GenericOrderInfo = {
          kind: "seaport",
          info: {
            kind: "partial",
            orderParams,
          } as orders.seaport.OrderInfo,
          relayToArweave: false,
          validateBidValue: true,
        };

        await orderbookOrders.addToQueue([orderInfo]);
      }
    }
  );
}

const handleEvent = (type: EventType, payload: unknown): PartialOrderComponents | null => {
  switch (type) {
    case EventType.ITEM_LISTED:
      return handleItemListedEvent(payload as ItemListedEventPayload);
    case EventType.ITEM_RECEIVED_BID:
      return handleItemReceivedBidEvent(payload as ItemReceivedBidEventPayload);
    case EventType.COLLECTION_OFFER:
      return handleCollectionOfferEvent(payload as CollectionOfferEventPayload);
    case EventType.TRAIT_OFFER:
      return handleTraitOfferEvent(payload as TraitOfferEventPayload);
    default:
      return null;
  }
};
