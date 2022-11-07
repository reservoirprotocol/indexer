import { Network, OpenSeaStreamClient } from "@opensea/stream-js";
import { WebSocket } from "ws";
import { config } from "@/config/index";
import { logger } from "@/common/logger";
import * as orderbookOrders from "@/jobs/orderbook/orders-queue";
import { PartialOrderComponents } from "@/orderbook/orders/seaport";
import * as orders from "@/orderbook/orders";
import { toTime } from "@/common/utils";
import _ from "lodash";

if (config.doWebsocketWork && config.openSeaApiKey) {
  const network = config.chainId === 5 ? Network.TESTNET : Network.MAINNET;

  const client = new OpenSeaStreamClient({
    token: config.openSeaApiKey,
    network,
    connectOptions: {
      transport: WebSocket,
    },
    onError: async (error) => {
      logger.error("opensea-websocket", `network=${network}, error=${error}`);
    },
  });

  client.connect();

  logger.info("opensea-websocket", `Connected to opensea ${network} stream API`);

  client.onItemListed("*", async (event) => {
    if (getSupportedChainName() === event.payload.item.chain.name) {
      // For now we ingest only fixed price and dutch auctions
      if (_.indexOf([null, "dutch"], event.payload.listing_type) === -1) {
        logger.info(
          "opensea-websocket",
          `onItemListed Event. non supported price listing event=${JSON.stringify(event)}`
        );
        return;
      }

      const currenTime = Math.floor(Date.now() / 1000);
      if (currenTime % 10 === 0) {
        logger.info("opensea-websocket", `onItemListed Event. event=${JSON.stringify(event)}`);
      }

      const [, contract, tokenId] = event.payload.item.nft_id.split("/");

      const orderInfo: orderbookOrders.GenericOrderInfo = {
        kind: "seaport",
        info: {
          kind: "partial",
          orderParams: {
            kind: "single-token",
            side: "sell",
            hash: event.payload.order_hash,
            price: event.payload.base_price,
            paymentToken: event.payload.payment_token.address,
            amount: event.payload.quantity,
            startTime: toTime(event.payload.listing_date),
            endTime: toTime(event.payload.expiration_date),
            contract,
            tokenId,
            offerer: event.payload.maker.address,
            listingType: event.payload.listing_type,
          } as PartialOrderComponents,
        } as orders.seaport.OrderInfo,
        relayToArweave: false,
        validateBidValue: true,
      };

      await orderbookOrders.addToQueue([orderInfo]);
    }
  });
}

const getSupportedChainName = () => {
  switch (config.chainId) {
    case 1:
      return "ethereum";
    case 5:
      return "goerli";
    case 137:
      return "polygon";
    default:
      return "unknown";
  }
};
