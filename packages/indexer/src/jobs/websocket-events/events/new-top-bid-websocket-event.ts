import { idb, redb } from "@/common/db";
import { formatEth, fromBuffer, now } from "@/common/utils";
import { Orders } from "@/utils/orders";
import _ from "lodash";
import { redis } from "@/common/redis";
import { logger } from "@/common/logger";
import { Sources } from "@/models/sources";
import { getJoiPriceObject } from "@/common/joi";
import { publishWebsocketEvent } from "@/common/websocketPublisher";

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
                orders.contract,
                orders.currency_value,
                orders.currency_price,
                orders.currency,
                orders.normalized_value,
                orders.currency_normalized_value,               
                orders.created_at,
                DATE_PART('epoch', LOWER(orders.valid_between)) AS "valid_from",
                COALESCE(
                     NULLIF(DATE_PART('epoch', UPPER(orders.valid_between)), 'Infinity'),
                     0
                   ) AS "valid_until",
                (${criteriaBuildQuery}) AS criteria,
                c.id as collection_id,
                c.slug as collection_slug,
                c.name as collection_name,
                c.normalized_floor_sell_value AS normalized_floor_sell_value,
                c.floor_sell_value AS floor_sell_value,
                c.non_flagged_floor_sell_value AS non_flagged_floor_sell_value,
                  
                COALESCE(((orders.value / (c.floor_sell_value * (1-((COALESCE(c.royalties_bps, 0)::float + 250) / 10000)))::numeric(78, 0) ) - 1) * 100, 0) AS floor_difference_percentage
              FROM orders
              JOIN LATERAL (
                SELECT c.id,
                c.slug,
                c.name,
                c.normalized_floor_sell_value,
                c.floor_sell_value,
                c.non_flagged_floor_sell_value,
                c.royalties_bps
                FROM token_sets_tokens
              	JOIN tokens
                  ON token_sets_tokens.contract = tokens.contract
                  AND token_sets_tokens.token_id = tokens.token_id
              	JOIN collections c on c.id = tokens.collection_id
              	WHERE orders.token_set_id = token_sets_tokens.token_set_id
              	LIMIT 1
              ) c ON TRUE
              WHERE orders.id = $/orderId/
              LIMIT 1
            `,
      { orderId: data.orderId }
    );

    if (await NewTopBidWebsocketEvent.isRateLimited(order.token_set_id)) {
      return;
    }

    const payloads = [];
    const owners = await NewTopBidWebsocketEvent.getOwners(order.token_set_id);
    const ownersChunks = _.chunk(owners, 25 * 20);
    const source = (await Sources.getInstance()).get(Number(order.source_id_int));

    for (const ownersChunk of ownersChunks) {
      const [price, priceNormalized] = await Promise.all([
        getJoiPriceObject(
          {
            net: {
              amount: order.currency_value ?? order.value,
              nativeAmount: order.value,
            },
            gross: {
              amount: order.currency_price ?? order.price,
              nativeAmount: order.price,
            },
          },
          fromBuffer(order.currency)
        ),
        getJoiPriceObject(
          {
            net: {
              amount: order.currency_normalized_value ?? order.currency_value ?? order.value,
              nativeAmount: order.normalized_value ?? order.value,
            },
            gross: {
              amount: order.currency_price ?? order.price,
              nativeAmount: order.price,
            },
          },
          fromBuffer(order.currency)
        ),
      ]);

      payloads.push({
        order: {
          id: order.id,
          contract: fromBuffer(order.contract),
          maker: fromBuffer(order.maker),
          createdAt: new Date(order.created_at).toISOString(),
          validFrom: order.valid_from,
          validUntil: order.valid_until,
          source: {
            id: source?.address,
            domain: source?.domain,
            name: source?.getTitle(),
            icon: source?.getIcon(),
            url: source?.metadata.url,
          },
          price: {
            currency: price.currency,
            amount: price.amount,
            netAmount: price.netAmount,
            normalizedNetAmount: priceNormalized.netAmount,
          },

          criteria: order.criteria,
        },
        owners: ownersChunk,
        collection: {
          id: order.collection_id,
          slug: order.collection_slug,
          name: order.collection_name,
          floorAskPrice: order.floor_sell_value ? formatEth(order.floor_sell_value) : null,
          floorAskPriceNormalized: order.normalized_floor_sell_value
            ? formatEth(order.normalized_floor_sell_value)
            : null,
          floorAskPriceNonFlagged: order.non_flagged_floor_sell_value
            ? formatEth(order.non_flagged_floor_sell_value)
            : null,
          floorDifferencePercentage: _.round(order.floor_difference_percentage || 0, 2),
        },
      });
    }

    try {
      await Promise.all(
        payloads.map((payload) =>
          publishWebsocketEvent({
            event: "top-bid.changed",
            tags: {
              contract: fromBuffer(order.contract),
              source: payload?.order?.source.domain || "unknown",
            },
            data: payload,
          })
        )
      );
    } catch (e) {
      logger.error("top-bids-websocket-event", `Error triggering event. ${e}`);
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
        await redb.manyOrNone(
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
