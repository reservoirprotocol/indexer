import { ItemCancelledEventPayload } from "@opensea/stream-js/dist/types";

import * as openseaOffChainCancellations from "@/jobs/order-updates/misc/opensea-off-chain-cancellations";

export const handleEvent = async (payload: ItemCancelledEventPayload) => {
  await openseaOffChainCancellations.addToQueue(payload.order_hash);

  return null;
};
