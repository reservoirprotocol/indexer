import { now, toTime } from "@/common/utils";

import { PartialOrderComponents } from "@/orderbook/orders/seaport";
import { CollectionOfferEventPayload } from "@opensea/stream-js";
import { getNetworkSettings } from "@/config/network";

export const handleEvent = (
  payload: CollectionOfferEventPayload
): PartialOrderComponents | null => {
  if (!getNetworkSettings().supportedBidCurrencies[payload.payment_token.address]) {
    return null;
  }

  return {
    kind: "contract-wide",
    side: "buy",
    hash: payload.order_hash,
    price: payload.base_price,
    paymentToken: payload.payment_token.address,
    amount: payload.quantity,
    startTime: now(),
    endTime: toTime(payload.expiration_date),
    contract: (payload.asset_contract_criteria as { address: string }).address,
    offerer: payload.maker.address,
    collectionSlug: payload.collection.slug,
  };
};
