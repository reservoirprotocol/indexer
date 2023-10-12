import { ItemCancelledEventPayload } from "@opensea/stream-js/dist/types";

import { openseaOffChainCancellationsJob } from "@/jobs/order-updates/misc/opensea-off-chain-cancellations-job";

export const handleEvent = async (payload: ItemCancelledEventPayload) => {
  await openseaOffChainCancellationsJob.addToQueue({ orderId: payload.order_hash });

  return null;
};
