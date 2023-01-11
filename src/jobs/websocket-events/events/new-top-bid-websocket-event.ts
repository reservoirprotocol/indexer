import { idb } from "@/common/db";
import * as Pusher from "pusher";
import { fromBuffer } from "@/common/utils";
import { Orders } from "@/utils/orders";
import _ from "lodash";
import { BatchEvent } from "pusher";
import { config } from "@/config/index";
import { redis } from "@/common/redis";

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

    const payloads = [];

    const owners = await NewTopBidWebsocketEvent.getOwners(order.token_set_id);
    const ownersChunks = _.chunk(owners, Number(config.websocketServerEventMaxSizeInKb) * 20);

    for (const ownersChunk of ownersChunks) {
      payloads.push({
        id: order.id,
        maker: fromBuffer(order.maker),
        criteria: order.criteria,
        owners: ownersChunk,
      });
    }

    const server = new Pusher.default({
      appId: config.websocketServerAppId,
      key: config.websocketServerAppKey,
      secret: config.websocketServerAppSecret,
      host: config.websocketServerHost,
    });

    const payloadsBatches = _.chunk(payloads, Number(config.websocketServerEventMaxBatchSize));

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

  static async getOwners(tokenSetId: string): Promise<string[]> {
    let owners: string[] | undefined = undefined;

    const ownersString = await redis.get(`token-set-owners:${tokenSetId}`);

    if (ownersString) {
      owners = JSON.parse(ownersString);
    }

    if (!owners) {
      owners = (
        await idb.manyOrNone(
          `
                SELECT
                  DISTINCT nb.owner
                FROM nft_balances nb
                JOIN token_sets_tokens tst ON tst.contract = nb.contract AND tst.token_id = nb.token_id
                WHERE tst.token_set_id = $/tokenSetId/
                  AND nb.amount > 0
              `,
          {
            tokenSetId,
          }
        )
      ).map((result) => fromBuffer(result.owner));

      await redis.set(`token-set-owners:${tokenSetId}`, JSON.stringify(owners), "EX", 60);
    }

    return owners;
  }
}

export type NewTopBidWebsocketEventInfo = {
  orderId: string;
};
