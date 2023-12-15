/* eslint-disable @typescript-eslint/no-explicit-any */

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
import { now } from "@/common/utils";
import { config } from "@/config/index";
import { OpenseaOrderParams } from "@/orderbook/orders/seaport-v1.1";
import { generateHash } from "@/websockets/opensea/utils";
import { GenericOrderInfo } from "@/jobs/orderbook/utils";
import { handleEvent as handleItemListedEvent } from "@/websockets/opensea/handlers/item_listed";
import { handleEvent as handleItemReceivedBidEvent } from "@/websockets/opensea/handlers/item_received_bid";
import { handleEvent as handleCollectionOfferEvent } from "@/websockets/opensea/handlers/collection_offer";
import { handleEvent as handleItemCancelled } from "@/websockets/opensea/handlers/item_cancelled";
import { handleEvent as handleOrderRevalidate } from "@/websockets/opensea/handlers/order_revalidate";
import { handleEvent as handleTraitOfferEvent } from "@/websockets/opensea/handlers/trait_offer";

import { openseaBidsQueueJob } from "@/jobs/orderbook/opensea-bids-queue-job";
import { openseaListingsJob } from "@/jobs/orderbook/opensea-listings-job";
import { getNetworkSettings, getOpenseaNetworkName } from "@/config/network";
import _ from "lodash";
import { Collections } from "@/models/collections";
import { metadataIndexFetchJob } from "@/jobs/metadata-index/metadata-fetch-job";

let lastReceivedEventTimestamp: number;

if (config.doWebsocketWork && config.openSeaApiKey) {
  const network = getNetworkSettings().isTestnet ? Network.TESTNET : Network.MAINNET;
  const maxBidsSize = config.chainId === 1 ? 200 : 1;
  const bidsEvents: GenericOrderInfo[] = [];

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
      EventType.COLLECTION_OFFER,
      EventType.ITEM_RECEIVED_BID,
      EventType.TRAIT_OFFER,
      EventType.ITEM_CANCELLED,
      EventType.ORDER_REVALIDATE,
    ],
    async (event) => {
      try {
        lastReceivedEventTimestamp = now();

        if (await isDuplicateEvent(event)) {
          return;
        }

        const chainName = (event.payload as any).chain;
        const eventType = event.event_type as EventType;
        const openSeaOrderParams = await handleEvent(eventType, event.payload);

        // Reduce amount of logs by only total the amount of events received from Ethereum mainnet.
        if (_.random(100) <= 50 && (openSeaOrderParams || config.chainId === 1)) {
          logger.debug(
            "opensea-websocket",
            JSON.stringify({
              message: "Processing event.",
              network,
              event,
              isSupported: !!openSeaOrderParams,
              chainName,
              hasChainName: !!chainName,
            })
          );
        }

        if (openSeaOrderParams) {
          const protocolData = parseProtocolData(event.payload);

          let orderInfo: GenericOrderInfo;
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
              await openseaListingsJob.addToQueue([orderInfo]);
            } else {
              bidsEvents.push(orderInfo);

              if (bidsEvents.length >= maxBidsSize) {
                const orderInfoBatch = bidsEvents.splice(0, bidsEvents.length);

                await openseaBidsQueueJob.addToQueue(orderInfoBatch);
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

  if (getOpenseaNetworkName()) {
    client.onItemMetadataUpdated("*", async (event) => {
      try {
        if (getOpenseaNetworkName() != event.payload.item.chain.name) {
          return;
        }

        if (await isDuplicateEvent(event)) {
          return;
        }

        const [, contract, tokenId] = event.payload.item.nft_id.split("/");

        if (config.chainId === 1) {
          const collection = await Collections.getByContractAndTokenId(contract, Number(tokenId));

          await metadataIndexFetchJob.addToQueue([
            {
              kind: "single-token",
              data: {
                method: metadataIndexFetchJob.getIndexingMethod(collection?.community || null),
                contract,
                tokenId,
                collection: collection?.id || contract,
              },
            },
          ]);
        } else {
          await metadataIndexFetchJob.addToQueue([
            {
              kind: "single-token",
              data: {
                method: config.metadataIndexingMethod,
                contract,
                tokenId,
                collection: contract,
              },
            },
          ]);
        }

        logger.info(
          "opensea-websocket-item-metadata-update-event",
          JSON.stringify({
            message: `Processed event. network=${network}, contract=${contract}, tokenId=${tokenId}`,
            event,
            contract,
            tokenId,
          })
        );
      } catch (error) {
        logger.error(
          "opensea-websocket-item-metadata-update-event",
          JSON.stringify({
            message: `Error. network=${network}, event=${JSON.stringify(event)}, error=${error}`,
            error,
          })
        );
      }
    });
  }
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

export const getLastReceivedEventTimestamp = (): number => {
  return lastReceivedEventTimestamp;
};
