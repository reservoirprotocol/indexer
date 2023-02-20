import {
  BaseStreamMessage,
  CollectionOfferEventPayload,
  EventType,
  ItemReceivedBidEventPayload,
  Network,
  OpenSeaStreamClient,
  TraitOfferEventPayload,
} from "@opensea/stream-js";
import { WebSocket } from "ws";
import * as Sdk from "@reservoir0x/sdk";

import { config } from "@/config/index";
import { logger } from "@/common/logger";
import { ItemListedEventPayload } from "@opensea/stream-js/dist/types";
import { handleEvent as handleItemListedEvent } from "@/websockets/opensea/handlers/item_listed";
import { handleEvent as handleItemReceivedBidEvent } from "@/websockets/opensea/handlers/item_received_bid";
import { handleEvent as handleCollectionOfferEvent } from "@/websockets/opensea/handlers/collection_offer";
import { handleEvent as handleTraitOfferEvent } from "@/websockets/opensea/handlers/trait_offer";

import { PartialOrderComponents } from "@/orderbook/orders/seaport";
import * as orderbookOrders from "@/jobs/orderbook/orders-queue";
import * as orderbookOpenseaListings from "@/jobs/orderbook/opensea-listings-queue";

import * as orders from "@/orderbook/orders";
import { redis } from "@/common/redis";
import { now } from "@/common/utils";
import { generateHash } from "@/websockets/opensea/utils";
import { OpenseaWebsocketEvents } from "@/models/opensea-websocket-events";

if (config.doWebsocketWork && config.openSeaApiKey) {
  const network = config.chainId === 5 ? Network.TESTNET : Network.MAINNET;

  const client = new OpenSeaStreamClient({
    token: config.openSeaApiKey,
    network,
    connectOptions: {
      transport: WebSocket,
    },
    onError: async (error) => {
      logger.warn("opensea-websocket", `network=${network}, error=${JSON.stringify(error)}`);
    },
  });

  client.connect();

  logger.info("opensea-websocket", `Connected! network=${network}`);

  client.onEvents(
    "*",
    [
      EventType.ITEM_LISTED,
      EventType.ITEM_RECEIVED_BID,
      EventType.COLLECTION_OFFER,
      EventType.TRAIT_OFFER,
    ],
    async (event) => {
      try {
        if (await isDuplicateEvent(event)) {
          logger.debug(
            "opensea-websocket",
            `Duplicate event. network=${network}, event=${JSON.stringify(event)}`
          );

          return;
        }

        await saveEvent(event);

        const eventType = event.event_type as EventType;
        const openSeaOrderParams = handleEvent(eventType, event.payload);

        if (openSeaOrderParams) {
          const seaportOrder = parseProtocolData(event.payload);

          let orderInfo: orderbookOrders.GenericOrderInfo;

          if (seaportOrder) {
            orderInfo = {
              kind: "seaport",
              info: {
                kind: "full",
                orderParams: seaportOrder.params,
                metadata: {
                  originatedAt: event.sent_at,
                },
                openSeaOrderParams,
              } as orders.seaport.OrderInfo,
              relayToArweave: eventType === EventType.ITEM_LISTED,
              validateBidValue: true,
            };
          } else {
            orderInfo = {
              kind: "seaport",
              info: {
                kind: "partial",
                orderParams: openSeaOrderParams,
                metadata: {
                  originatedAt: event.sent_at,
                },
              } as orders.seaport.OrderInfo,
              relayToArweave: false,
              validateBidValue: true,
            };
          }

          if (eventType === EventType.ITEM_LISTED) {
            await orderbookOpenseaListings.addToQueue([orderInfo]);
          } else {
            await orderbookOrders.addToQueue([orderInfo]);
          }
        }
      } catch (error) {
        logger.error(
          "opensea-websocket",
          `network=${network}, event=${JSON.stringify(event)}, error=${error}`
        );
      }
    }
  );
}

const saveEvent = async (event: BaseStreamMessage<unknown>) => {
  if (!config.openseaWebsocketEventsAwsFirehoseDeliveryStreamName) {
    return;
  }

  const openseaWebsocketEvents = new OpenseaWebsocketEvents();
  await openseaWebsocketEvents.add([
    {
      event,
      createdAt: new Date().toISOString(),
    },
  ]);
};

export const getEventHash = (event: BaseStreamMessage<unknown>): string => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  return generateHash(event.event_type, (event.payload as any).order_hash);
};

export const isDuplicateEvent = async (event: BaseStreamMessage<unknown>): Promise<boolean> => {
  const eventHash = getEventHash(event);

  const setResult = await redis.set(
    `opensea-websocket-event:${eventHash}`,
    now(),
    "EX",
    60 * 5,
    "NX"
  );

  return setResult === null;
};

export const handleEvent = (type: EventType, payload: unknown): PartialOrderComponents | null => {
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

export const parseProtocolData = (payload: unknown): Sdk.Seaport.Order | undefined => {
  try {
    const protocolData = (payload as any).protocol_data;

    if (!protocolData) {
      logger.warn(
        "opensea-websocket",
        `parseProtocolData missing. payload=${JSON.stringify(payload)}`
      );

      return;
    }

    return new Sdk.Seaport.Order(config.chainId, {
      endTime: protocolData.parameters.endTime,
      startTime: protocolData.parameters.startTime,
      consideration: protocolData.parameters.consideration,
      offer: protocolData.parameters.offer,
      conduitKey: protocolData.parameters.conduitKey,
      salt: protocolData.parameters.salt,
      zone: protocolData.parameters.zone,
      zoneHash: protocolData.parameters.zoneHash,
      offerer: protocolData.parameters.offerer,
      counter: `${protocolData.parameters.counter}`,
      orderType: protocolData.parameters.orderType,
      signature: protocolData.signature,
    });
  } catch (error) {
    logger.error(
      "opensea-websocket",
      `parseProtocolData error. payload=${JSON.stringify(payload)}, error=${error}`
    );
  }
};
