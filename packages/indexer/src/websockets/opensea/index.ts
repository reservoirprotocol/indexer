import {
  BaseStreamMessage,
  CollectionOfferEventPayload,
  EventType,
  ItemReceivedBidEventPayload,
  Network,
  OpenSeaStreamClient,
  TraitOfferEventPayload,
} from "@opensea/stream-js";
import {
  ItemCancelledEventPayload,
  ItemListedEventPayload,
  OrderValidationEventPayload,
} from "@opensea/stream-js/dist/types";
import * as Sdk from "@reservoir0x/sdk";
import { WebSocket } from "ws";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { now } from "lodash";
import { config } from "@/config/index";
import { OpenseaOrderParams } from "@/orderbook/orders/seaport-v1.1";
import { generateHash, getSupportedChainName } from "@/websockets/opensea/utils";
import * as orderbookOrders from "@/jobs/orderbook/orders-queue";
import { GenericOrderInfo } from "@/jobs/orderbook/orders-queue";
import * as orderbookOpenseaListings from "@/jobs/orderbook/opensea-listings-queue";
import { handleEvent as handleItemListedEvent } from "@/websockets/opensea/handlers/item_listed";
import { handleEvent as handleItemReceivedBidEvent } from "@/websockets/opensea/handlers/item_received_bid";
import { handleEvent as handleCollectionOfferEvent } from "@/websockets/opensea/handlers/collection_offer";
import { handleEvent as handleItemCancelled } from "@/websockets/opensea/handlers/item_cancelled";
import { handleEvent as handleOrderRevalidate } from "@/websockets/opensea/handlers/order_revalidate";
import { handleEvent as handleTraitOfferEvent } from "@/websockets/opensea/handlers/trait_offer";
import MetadataApi from "@/utils/metadata-api";
import * as metadataIndexWrite from "@/jobs/metadata-index/write-queue";

if (config.doWebsocketWork && config.openSeaApiKey) {
  const network = config.chainId === 5 ? Network.TESTNET : Network.MAINNET;
  const maxBidsSize = config.chainId === 1 ? 200 : 1;
  const bidsEvents: GenericOrderInfo[] = [];

  const client = new OpenSeaStreamClient({
    token: config.openSeaApiKey,
    network,
    connectOptions: {
      transport: WebSocket,
    },
    onError: async (error) => {
      logger.warn("opensea-websocket", `network=${network}, error=${error}`);
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
      EventType.ITEM_CANCELLED,
      EventType.ORDER_REVALIDATE,
    ],
    async (event) => {
      try {
        if (await isDuplicateEvent(event)) {
          return;
        }

        logger.debug(
          "opensea-websocket",
          `Processing event. network=${network}, event=${JSON.stringify(event)}`
        );

        // await saveEvent(event);

        const eventType = event.event_type as EventType;
        const openSeaOrderParams = await handleEvent(eventType, event.payload);

        if (openSeaOrderParams) {
          const protocolData = parseProtocolData(event.payload);

          let orderInfo: orderbookOrders.GenericOrderInfo;
          if (protocolData) {
            orderInfo = {
              kind: protocolData.kind,
              info: {
                orderParams: protocolData.order.params,
                metadata: {
                  originatedAt: event.sent_at,
                },
                isOpenSea: true,
                openSeaOrderParams,
              },
              validateBidValue: true,
              ingestMethod: "websocket",
            } as GenericOrderInfo;

            if (eventType === EventType.ITEM_LISTED) {
              await orderbookOpenseaListings.addToQueue([orderInfo]);
            } else {
              bidsEvents.push(orderInfo);

              if (bidsEvents.length >= maxBidsSize) {
                const orderInfoBatch = bidsEvents.splice(0, bidsEvents.length);
                await orderbookOrders.addToQueue(orderInfoBatch);
              }
            }
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

  client.onItemMetadataUpdated("*", async (event) => {
    try {
      if (getSupportedChainName() != event.payload.item.chain.name) {
        return;
      }

      if (await isDuplicateEvent(event)) {
        return;
      }

      const [, contract, tokenId] = event.payload.item.nft_id.split("/");

      const metadata = {
        asset_contract: {
          address: contract,
        },
        collection: {
          slug: event.payload.collection.slug,
        },
        token_id: tokenId,
        name: event.payload.item.metadata.name ?? undefined,
        description: event.payload.item.metadata.description ?? undefined,
        image_url: event.payload.item.metadata.image_url ?? undefined,
        animation_url: event.payload.item.metadata.animation_url ?? undefined,
        traits: event.payload.item.metadata.traits,
      };

      const parsedMetadata = await MetadataApi.parseTokenMetadata(metadata, "opensea");

      if (parsedMetadata) {
        await metadataIndexWrite.addToQueue([parsedMetadata]);
      }
    } catch (error) {
      logger.error(
        "opensea-websocket-item-metadata-update-event",
        `Error. network=${network}, event=${JSON.stringify(event)}, error=${error}`
      );
    }
  });
}

export const getEventHash = (event: BaseStreamMessage<unknown>): string => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  switch (event.event_type) {
    case EventType.ITEM_METADATA_UPDATED:
      return generateHash(
        event.event_type,
        (event.payload as any).item.nft_id,
        (event.payload as any).sent_at
      );
    default:
      return generateHash(event.event_type, (event.payload as any).order_hash);
  }
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

export const handleEvent = async (
  type: EventType,
  payload: unknown
  // `PartialOrderComponents` has the same types for both `seaport` and `seaport-v1.4`
): Promise<OpenseaOrderParams | null> => {
  switch (type) {
    case EventType.ITEM_LISTED:
      return handleItemListedEvent(payload as ItemListedEventPayload);
    case EventType.ITEM_RECEIVED_BID:
      return handleItemReceivedBidEvent(payload as ItemReceivedBidEventPayload);
    case EventType.COLLECTION_OFFER:
      return handleCollectionOfferEvent(payload as CollectionOfferEventPayload);
    case EventType.TRAIT_OFFER:
      return handleTraitOfferEvent(payload as TraitOfferEventPayload);
    case EventType.ITEM_CANCELLED:
      return await handleItemCancelled(payload as ItemCancelledEventPayload);
    case EventType.ORDER_REVALIDATE:
      return await handleOrderRevalidate(payload as OrderValidationEventPayload);
    default:
      return null;
  }
};

type ProtocolData =
  | {
      kind: "seaport";
      order: Sdk.SeaportV11.Order;
    }
  | {
      kind: "seaport-v1.4";
      order: Sdk.SeaportV14.Order;
    }
  | {
      kind: "seaport-v1.5";
      order: Sdk.SeaportV15.Order;
    };

export const parseProtocolData = (payload: unknown): ProtocolData | undefined => {
  try {
    const protocolData = (payload as any).protocol_data;
    if (!protocolData) {
      logger.warn(
        "opensea-websocket",
        `parseProtocolData missing. payload=${JSON.stringify(payload)}`
      );
      return undefined;
    }

    const protocol = (payload as any).protocol_address;
    const orderComponents = {
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
      signature: protocolData.signature || undefined,
    };

    if (protocol === Sdk.SeaportV11.Addresses.Exchange[config.chainId]) {
      return {
        kind: "seaport",
        order: new Sdk.SeaportV11.Order(config.chainId, orderComponents),
      };
    } else if (protocol === Sdk.SeaportV14.Addresses.Exchange[config.chainId]) {
      return {
        kind: "seaport-v1.4",
        order: new Sdk.SeaportV14.Order(config.chainId, orderComponents),
      };
    } else if (protocol === Sdk.SeaportV15.Addresses.Exchange[config.chainId]) {
      return {
        kind: "seaport-v1.5",
        order: new Sdk.SeaportV15.Order(config.chainId, orderComponents),
      };
    }
  } catch (error) {
    logger.error(
      "opensea-websocket",
      `parseProtocolData error. payload=${JSON.stringify(payload)}, error=${error}`
    );
  }

  return undefined;
};
