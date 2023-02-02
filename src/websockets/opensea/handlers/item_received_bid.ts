import { now, toTime } from "@/common/utils";
import { getSupportedChainName } from "@/websockets/opensea/utils";
import { PartialOrderComponents } from "@/orderbook/orders/seaport";
import { ItemReceivedBidEventPayload } from "@opensea/stream-js";
import { getNetworkSettings } from "@/config/network";

export const handleEvent = (
  payload: ItemReceivedBidEventPayload
): PartialOrderComponents | null => {
  if (getSupportedChainName() != payload.item.chain.name) {
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
