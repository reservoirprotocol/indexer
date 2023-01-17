import { idb } from "@/common/db";
import * as Pusher from "pusher";
import { formatEth, fromBuffer, now } from "@/common/utils";
import { Orders } from "@/utils/orders";
import _ from "lodash";
import { BatchEvent } from "pusher";
import { config } from "@/config/index";
import { redis } from "@/common/redis";
import { logger } from "@/common/logger";
import { Sources } from "@/models/sources";

export class NewTopBidWebsocketEvent {
  public static async triggerEvent(data: NewTopBidWebsocketEventInfo) {
    const criteriaBuildQuery = Orders.buildCriteriaQuery("orders", "token_set_id", false);

    const order = await idb.oneOrNone(
      `
              SELECT
                orders.id,
                orders.token_set_id,
                orders.source_id_int,
                orders.nonce,
                orders.maker,
                orders.price,
                orders.value,
                orders.created_at,
                (${criteriaBuildQuery}) AS criteria
              FROM orders
              WHERE orders.id = $/orderId/
              LIMIT 1
            `,
      { orderId: data.orderId }
    );

    if (await NewTopBidWebsocketEvent.isRateLimited(order.token_set_id)) {
      logger.info(
        "new-top-bid-websocket-event",
        `Rate limited. orderId=${data.orderId}, tokenSetId=${order.token_set_id}`
      );

      return;
    }

    const payloads = [];

    const owners = await NewTopBidWebsocketEvent.getOwners(order.token_set_id);
    const ownersChunks = _.chunk(owners, Number(config.websocketServerEventMaxSizeInKb) * 20);

    const source = (await Sources.getInstance()).get(Number(order.source_id_int));

    for (const ownersChunk of ownersChunks) {
      payloads.push({
        order: {
          id: order.id,
          maker: fromBuffer(order.maker),
          createdAt: new Date(order.created_at).toISOString(),
          source: {
            id: source?.address,
            domain: source?.domain,
            name: source?.getTitle(),
            icon: source?.getIcon(),
            url: source?.metadata.url,
          },
          price: formatEth(order.price),
          value: formatEth(order.value),
          criteria: order.criteria,
        },
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

  static async isRateLimited(tokenSetId: string): Promise<boolean> {
    const setResult = await redis.set(
      `new-top-bid-rate-limiter:${tokenSetId}`,
      now(),
      "EX",
      60,
      "NX"
    );
    return setResult === null;
  }
}

export type NewTopBidWebsocketEventInfo = {
  orderId: string;
};
