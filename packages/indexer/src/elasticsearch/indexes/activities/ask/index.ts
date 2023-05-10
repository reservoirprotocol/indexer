import { redb } from "@/common/db";

import { Orders } from "@/utils/orders";

import { ActivityType } from "@/elasticsearch/indexes/activities";
import { getActivityHash } from "@/elasticsearch/indexes/activities/utils";
import {
  BaseActivityBuilder,
  BuildInfo,
  BuildParams,
} from "@/elasticsearch/indexes/activities/base";

export class AskActivityBuilder extends BaseActivityBuilder {
  getActivityType(): ActivityType {
    return ActivityType.ask;
  }

  getId(buildInfo: BuildInfo): string {
    return getActivityHash(ActivityType.ask, buildInfo.order_id!);
  }

  buildBaseQuery() {
    const orderCriteriaBuildQuery = Orders.buildCriteriaQuery("orders", "token_set_id", false);

    return `
        SELECT
          orders.id AS "order_id",
          orders.side AS "order_side",
          orders.contract,
          orders.maker AS "from",
          orders.price AS "pricing_price",
          orders.currency AS "pricing_currency",
          orders.currency_price AS "pricing_currency_price",
          orders.value AS "pricing_value",
          orders.currency_value AS "pricing_currency_value",
          orders.normalized_value AS "pricing_normalized_value",
          orders.currency_normalized_value AS "pricing_currency_normalized_value",
          (orders.quantity_filled + orders.quantity_remaining) AS amount,
          orders.source_id_int AS "order_source_id_int",
          orders.fee_bps AS "pricing_fee_bps",
          (${orderCriteriaBuildQuery}) AS "order_criteria",
          extract(epoch from orders.created_at) AS created_ts,
          extract(epoch from orders.updated_at) AS updated_ts,
          t.*
        FROM orders
        LEFT JOIN LATERAL (
                    SELECT
                        tokens.token_id,
                        tokens.name AS "token_name",
                        tokens.image AS "token_image",
                        collections.id AS "collection_id",
                        collections.name AS "collection_name",
                        (collections.metadata ->> 'imageUrl')::TEXT AS "collection_image"
                    FROM tokens
                    JOIN collections on collections.id = tokens.collection_id
                    WHERE decode(substring(split_part(orders.token_set_id, ':', 2) from 3), 'hex') = tokens.contract
                    AND (split_part(orders.token_set_id, ':', 3)::NUMERIC(78, 0)) = tokens.token_id
                 ) t ON TRUE`;
  }

  async getBuildInfo(params: BuildParams): Promise<BuildInfo> {
    const result = await redb.oneOrNone(
      `
          ${this.buildBaseQuery()}
          WHERE id = $/orderId/
          LIMIT 1;
        `,
      {
        orderId: params.orderId!,
      }
    );

    result.timestamp = Math.floor(result.created_ts);

    return result;
  }
}
