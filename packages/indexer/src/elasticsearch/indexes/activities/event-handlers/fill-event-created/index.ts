/* eslint-disable @typescript-eslint/no-explicit-any */

import { toBuffer } from "@/common/utils";
import { idb } from "@/common/db";

import {
  ActivityDocument,
  ActivityType,
  BuildActivityData,
} from "@/elasticsearch/indexes/activities/base";
import { getActivityHash } from "@/elasticsearch/indexes/activities/utils";
import { Orders } from "@/utils/orders";
import { BaseActivityEventHandler } from "@/elasticsearch/indexes/activities/event-handlers/base";

export class FillEventCreatedEventHandler extends BaseActivityEventHandler {
  public txHash: string;
  public logIndex: number;
  public batchIndex: number;

  constructor(txHash: string, logIndex: number, batchIndex: number) {
    super();

    this.txHash = txHash;
    this.logIndex = logIndex;
    this.batchIndex = batchIndex;
  }

  async generateActivity(): Promise<ActivityDocument> {
    const data = await idb.oneOrNone(
      `
                ${FillEventCreatedEventHandler.buildBaseQuery()}
                WHERE tx_hash = $/txHash/
                AND log_index = $/logIndex/
                AND batch_index = $/batchIndex/
                LIMIT 1;  
                `,
      {
        txHash: toBuffer(this.txHash),
        logIndex: this.logIndex.toString(),
        batchIndex: this.batchIndex.toString(),
      }
    );

    return this.buildDocument(data);
  }

  getActivityType(data: BuildActivityData): ActivityType {
    if (data.order_kind === "mint") {
      return ActivityType.mint;
    }

    return ActivityType.sale;
  }

  getActivityId(): string {
    return getActivityHash(this.txHash, this.logIndex.toString(), this.batchIndex.toString());
  }

  public static buildBaseQuery(): string {
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
                        tokens.media AS "token_media",
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

  parseEvent(data: any) {
    if (data.order_side === "buy") {
      const dataFrom = data.from;
      const dataTo = data.to;

      data.from = dataTo;
      data.to = dataFrom;
    }

    data.timestamp = data.event_timestamp;
  }
}
