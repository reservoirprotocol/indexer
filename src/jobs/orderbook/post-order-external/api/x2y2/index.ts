import * as Sdk from "@reservoir0x/sdk";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { now, toBuffer } from "@/common/utils";
import { config } from "@/config/index";

// X2Y2 default rate limit - 120 requests per minute
export const RATE_LIMIT_REQUEST_COUNT = 120;
export const RATE_LIMIT_INTERVAL = 1000 * 60;

export const postOrder = async (order: Sdk.X2Y2.Types.LocalOrder, apiKey: string) => {
  const exchange = new Sdk.X2Y2.Exchange(config.chainId, apiKey);

  // Skip posting orders that already expired
  if (order.deadline <= now()) {
    return;
  }

  // When lowering the price of an existing listing, X2Y2 requires
  // passing the order id of the previous listing, so here we have
  // this check in place so that we can cover such scenarios.
  let orderId: number | undefined;
  const upstreamOrder = Sdk.X2Y2.Order.fromLocalOrder(config.chainId, order);
  if (upstreamOrder.params.type === "sell") {
    const activeOrder = await redb.oneOrNone(
      `
        SELECT
          (orders.raw_data ->> 'id')::INT AS id
        FROM orders
        WHERE orders.token_set_id = $/tokenSetId/
          AND orders.fillability_status = 'fillable'
          AND orders.approval_status = 'approved'
          AND orders.side = 'sell'
          AND orders.maker = $/maker/
          AND orders.kind = 'x2y2'
        LIMIT 1
      `,
      {
        tokenSetId:
          `token:${upstreamOrder.params.nft.token}:${upstreamOrder.params.nft.tokenId}`.toLowerCase(),
        maker: toBuffer(upstreamOrder.params.maker),
      }
    );

    if (activeOrder?.id) {
      orderId = activeOrder.id;
    }
  }

  await exchange.postOrder(order, orderId).catch((error) => {
    if (error.response) {
      logger.error(
        "x2y2_orderbook_api",
        `Failed to post order to X2Y2. order=${JSON.stringify(order)}, status: ${
          error.response.status
        }, data:${JSON.stringify(error.response.data)}`
      );
    }

    throw new Error("Failed to post order to X2Y2");
  });
};
