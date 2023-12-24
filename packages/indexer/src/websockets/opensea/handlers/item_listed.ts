import { toTime } from "@/common/utils";
import { ItemListedEventPayload } from "@opensea/stream-js/dist/types";
import { OpenseaOrderParams } from "@/orderbook/orders/seaport-v1.1";
import _ from "lodash";
import { getOpenseaNetworkName } from "@/config/network";

export const handleEvent = (payload: ItemListedEventPayload): OpenseaOrderParams | null => {
  if (getOpenseaNetworkName() != payload.item.chain.name) {
    return null;
  }

  if (_.indexOf([null, "dutch"], payload.listing_type) === -1) {
    return null;
  }

  const [, contract, tokenId] = payload.item.nft_id.split("/");

  return {
    kind: "single-token",
    side: "sell",
    hash: payload.order_hash,
    price: payload.base_price,
    paymentToken: payload.payment_token.address,
    amount: payload.quantity,
    startTime: toTime(payload.listing_date),
    endTime: toTime(payload.expiration_date),
    contract,
    tokenId,
    offerer: payload.maker.address,
    taker: payload.taker?.address,
    isDynamic: !_.isNull(payload.listing_type),
    collectionSlug: payload.collection.slug,
  };
};
