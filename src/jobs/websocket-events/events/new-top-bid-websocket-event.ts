import { idb } from "@/common/db";
import * as Pusher from "pusher";
import { fromBuffer } from "@/common/utils";
import { Orders } from "@/utils/orders";
import _ from "lodash";
import { BatchEvent } from "pusher";
import { config } from "@/config/index";

export class NewTopBidWebsocketEvent {
  public static async triggerEvent(data: NewTopBidWebsocketEventInfo) {
    const criteriaBuildQuery = Orders.buildCriteriaQuery("orders", "token_set_id", false);

    const order = await idb.oneOrNone(
      `
              SELECT
                orders.id,
                orders.side,
                orders.token_set_id,
                orders.source_id_int,
                orders.nonce,
                orders.maker,
                orders.price,
                orders.value,
                (${criteriaBuildQuery}) AS criteria
              FROM orders
              WHERE orders.id = $/orderId/
              LIMIT 1
            `,
      { orderId: data.orderId }
    );

    const results = await idb.manyOrNone(
      `
                SELECT
                  DISTINCT nft_balances.owner
                FROM orders
                JOIN token_sets_tokens ON orders.token_set_id = token_sets_tokens.token_set_id
                JOIN nft_balances ON nft_balances.contract = token_sets_tokens.contract AND nft_balances.token_id = token_sets_tokens.token_id
                WHERE orders.id = $/orderId/
                  AND nft_balances.amount > 0
              `,
      {
        orderId: data.orderId,
      }
    );

    const payloads = [];
    const resultsChunks = _.chunk(results, 1000);

    for (const resultsChunk of resultsChunks) {
      payloads.push({
        id: order.id,
        maker: fromBuffer(order.maker),
        criteria: order.criteria,
        owners: resultsChunk.map((result) => fromBuffer(result.owner)),
      });
    }

    const server = new Pusher.default({
      appId: config.websocketServerAppId,
      key: config.websocketServerAppKey,
      secret: config.websocketServerAppSecret,
      host: config.websocketServerHost,
    });

    const payloadsBatches = _.chunk(payloads, 10);

    for (const payloadsBatch of payloadsBatches) {
      const events: BatchEvent[] = payloadsBatch.map((payload) => {
        return {
          channel: "top-bids",
          name: "new-top-bid",
          data: JSON.stringify(payload),
        };
      });

      await server.triggerBatch(events);
    }
  }
}

export type NewTopBidWebsocketEventInfo = {
  orderId: string;
};
