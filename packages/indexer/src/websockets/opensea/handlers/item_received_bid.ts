import { now, toTime } from "@/common/utils";
import { OpenseaOrderParams } from "@/orderbook/orders/seaport-v1.1";
import { ItemReceivedBidEventPayload } from "@opensea/stream-js";
import { getNetworkSettings, getOpenseaNetworkName } from "@/config/network";

export const handleEvent = (payload: ItemReceivedBidEventPayload): OpenseaOrderParams | null => {
  if (getOpenseaNetworkName() != payload.item.chain.name) {
    return null;
  }

  if (!getNetworkSettings().supportedBidCurrencies[payload.payment_token.address]) {
    return null;
  }

  const [, contract, tokenId] = payload.item.nft_id.split("/");

  return {
    kind: "single-token",
    side: "buy",
    hash: payload.order_hash,
    price: payload.base_price,
    paymentToken: payload.payment_token.address,
    amount: payload.quantity,
    startTime: now(),
    endTime: toTime(payload.expiration_date),
    contract,
    tokenId,
    offerer: payload.maker.address,
    collectionSlug: payload.collection.slug,
  };
};
