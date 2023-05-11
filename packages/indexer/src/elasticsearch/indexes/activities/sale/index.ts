import { fromBuffer, toBuffer } from "@/common/utils";
import { redb } from "@/common/db";
import { Orders } from "@/utils/orders";

import { ActivityType } from "@/elasticsearch/indexes/activities";
import { getActivityHash } from "@/elasticsearch/indexes/activities/utils";
import {
  BaseActivityBuilder,
  BuildParams,
  BuildInfo,
} from "@/elasticsearch/indexes/activities/base";

export class SaleActivityBuilder extends BaseActivityBuilder {
  getActivityType(buildInfo: BuildInfo): ActivityType {
    if (buildInfo.order_kind === "mint") {
      return ActivityType.mint;
    }

    return ActivityType.sale;
  }

  getId(buildInfo: BuildInfo): string {
    // TODO: Handle OnChain Orders
    return getActivityHash(
      fromBuffer(buildInfo.event_tx_hash!),
      buildInfo.event_log_index!.toString(),
      buildInfo.event_batch_index!.toString()
    );
  }

  buildBaseQuery(): string {
    const orderCriteriaBuildQuery = Orders.buildCriteriaQuery("orders", "token_set_id", false);

    return `SELECT
                  contract,
                  token_id,
                  order_id,
                  order_kind,
                  order_side,
                  order_source_id_int,
                  maker AS "from",
                  taker AS "to",
                  amount,
                  tx_hash AS "event_tx_hash",
                  timestamp AS "event_timestamp",
                  block_hash AS "event_block_hash",
                  log_index AS "event_log_index",
                  batch_index AS "event_batch_index",
                  currency AS "pricing_currency",
                  price AS "pricing_price",
                  currency_price AS "pricing_currency_price",
                  usd_price AS "pricing_usd_price",
                  t.*,
                  o.*
                FROM fill_events_2
                LEFT JOIN LATERAL (
                    SELECT
                        tokens.name AS "token_name",
                        tokens.image AS "token_image",
                        collections.id AS "collection_id",
                        collections.name AS "collection_name",
                        (collections.metadata ->> 'imageUrl')::TEXT AS "collection_image"
                    FROM tokens
                    JOIN collections on collections.id = tokens.collection_id
                    WHERE fill_events_2.contract = tokens.contract
                    AND fill_events_2.token_id = tokens.token_id
                 ) t ON TRUE
                 LEFT JOIN LATERAL (
                    SELECT
                    (${orderCriteriaBuildQuery}) AS "order_criteria"
                    FROM orders
                    WHERE fill_events_2.order_id = orders.id
                ) o ON TRUE`;
  }

  async getBuildInfo(params: BuildParams): Promise<BuildInfo> {
    const result = await redb.oneOrNone(
      `
                ${this.buildBaseQuery()}
                WHERE tx_hash = $/txHash/
                AND log_index = $/logIndex/
                AND batch_index = $/batchIndex/
                LIMIT 1;  
                `,
      {
        txHash: toBuffer(params.txHash!),
        logIndex: params.logIndex!.toString(),
        batchIndex: params.batchIndex!.toString(),
      }
    );

    return this.formatData(result);
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  formatData(result: any): BuildInfo {
    if (result.order_side === "buy") {
      result.from = result.to;
      result.to = result.from;
    }

    result.timestamp = result.event_timestamp;

    return result;
  }
}
