import { now, toTime } from "@/common/utils";

import { PartialOrderComponents } from "@/orderbook/orders/seaport";
import { TraitOfferEventPayload } from "@opensea/stream-js";
import { getNetworkSettings } from "@/config/network";

export const handleEvent = (payload: TraitOfferEventPayload): PartialOrderComponents | null => {
  if (!getNetworkSettings().supportedBidCurrencies[payload.payment_token.address]) {
    return null;
  }

  const traitCriteria = payload.trait_criteria as { trait_type: string; trait_name: string };

  return {
    kind: "token-list",
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
    attributeKey: traitCriteria.trait_type,
    attributeValue: traitCriteria.trait_name,
  };
};
