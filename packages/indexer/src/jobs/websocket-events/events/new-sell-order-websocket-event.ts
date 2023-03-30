import * as Sdk from "@reservoir0x/sdk";
import _ from "lodash";

import { idb } from "@/common/db";
import { getJoiPriceObject } from "@/common/joi";
import { fromBuffer, getNetAmount } from "@/common/utils";
import { config } from "@/config/index";
import { Sources } from "@/models/sources";
import { SourcesEntity } from "@/models/sources/sources-entity";
import { redisWebsocketPublisher } from "@/common/redis";
import { logger } from "@/common/logger";
import { Orders } from "@/utils/orders";
export class NewSellOrderWebsocketEvent {
  public static async triggerEvent(data: NewSellOrderWebsocketEventInfo) {
    try {
      const criteriaBuildQuery = Orders.buildCriteriaQuery("orders", "token_set_id", false);

      const rawResult = await idb.oneOrNone(
        `
            SELECT orders.id,
            orders.kind,
            orders.side,
            orders.token_set_id,
            orders.token_set_schema_hash,
            orders.contract,
            orders.maker,
            orders.taker,
            orders.currency,
            orders.price,
            orders.value,
            orders.currency_price,
            orders.currency_value,
            orders.normalized_value,
            orders.currency_normalized_value,
            orders.missing_royalties,
            DYNAMIC,
            DATE_PART('epoch', LOWER(orders.valid_between)) AS valid_from,
            COALESCE(NULLIF(DATE_PART('epoch', UPPER(orders.valid_between)), 'Infinity'), 0) AS valid_until,
            orders.source_id_int,
            orders.quantity_filled,
            orders.quantity_remaining,
            coalesce(orders.fee_bps, 0) AS fee_bps,
            orders.fee_breakdown,
            COALESCE(NULLIF(DATE_PART('epoch', orders.expiration), 'Infinity'), 0) AS expiration,
            orders.is_reservoir,
            extract(epoch
            FROM orders.created_at) AS created_at,
            (${criteriaBuildQuery}) AS criteria
      FROM orders
      WHERE (orders.side = 'sell')
        AND (orders.id = $/orderId/)
        AND (orders.taker = '\\x0000000000000000000000000000000000000000'
            OR orders.taker IS NULL)
      ORDER BY orders.created_at DESC,
              orders.id DESC
      LIMIT 1`,
        { orderId: data.orderId }
      );

      const sources = await Sources.getInstance();

      const feeBreakdown = rawResult.fee_breakdown;
      const feeBps = rawResult.fee_bps;

      let source: SourcesEntity | undefined;
      if (rawResult.token_set_id?.startsWith("token")) {
        const [, contract, tokenId] = rawResult.token_set_id.split(":");
        source = sources.get(Number(rawResult.source_id_int), contract, tokenId);
      } else {
        source = sources.get(Number(rawResult.source_id_int));
      }

      const result = {
        id: rawResult.id,
        kind: rawResult.kind,
        side: rawResult.side,
        status: rawResult.status,
        tokenSetId: rawResult.token_set_id,
        tokenSetSchemaHash: fromBuffer(rawResult.token_set_schema_hash),
        contract: fromBuffer(rawResult.contract),
        maker: fromBuffer(rawResult.maker),
        taker: fromBuffer(rawResult.taker),
        price: await getJoiPriceObject(
          {
            gross: {
              amount: rawResult.currency_price ?? rawResult.price,
              nativeAmount: rawResult.price,
            },
            net: {
              amount: getNetAmount(
                rawResult.currency_price ?? rawResult.price,
                _.min([rawResult.fee_bps, 10000])
              ),
              nativeAmount: getNetAmount(rawResult.price, _.min([rawResult.fee_bps, 10000])),
            },
          },
          rawResult.currency
            ? fromBuffer(rawResult.currency)
            : rawResult.side === "sell"
            ? Sdk.Common.Addresses.Eth[config.chainId]
            : Sdk.Common.Addresses.Weth[config.chainId],
          undefined
        ),
        validFrom: Number(rawResult.valid_from),
        validUntil: Number(rawResult.valid_until),
        quantityFilled: Number(rawResult.quantity_filled),
        quantityRemaining: Number(rawResult.quantity_remaining),

        criteria: rawResult.criteria,
        source: {
          id: source?.address,
          domain: source?.domain,
          name: source?.getTitle(),
          icon: source?.getIcon(),
          url: source?.metadata.url,
        },
        feeBps: Number(feeBps.toString()),
        feeBreakdown: feeBreakdown,
        expiration: Number(rawResult.expiration),
        isReservoir: rawResult.is_reservoir,
        isDynamic: Boolean(rawResult.dynamic || rawResult.kind === "sudoswap"),
        createdAt: new Date(rawResult.created_at * 1000).toISOString(),
        rawData: rawResult.raw_data,
      };

      redisWebsocketPublisher.publish(
        "asks",
        JSON.stringify({
          event: "ask.created",
          data: result,
        })
      );
    } catch (e) {
      logger.error("new-ask-websocket-event", `Error triggering event. ${e}`);
    }
  }
}

export type NewSellOrderWebsocketEventInfo = {
  orderId: string;
};
