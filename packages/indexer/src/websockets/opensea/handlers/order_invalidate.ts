import { OrderValidationEventPayload } from "@opensea/stream-js/dist/types";

import * as openseaOffChainCancellations from "@/jobs/order-updates/misc/opensea-off-chain-cancellations";
import { getSupportedChainName } from "@/websockets/opensea/utils";

export const handleEvent = async (payload: OrderValidationEventPayload) => {
  if (getSupportedChainName() != payload.chain.name) {
    return null;
  }

  await openseaOffChainCancellations.addToQueue(payload.order_hash);

  return null;
};
