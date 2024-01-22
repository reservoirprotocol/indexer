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
import {
  BaseActivityEventHandler,
  NftTransferEventInfo,
} from "@/elasticsearch/indexes/activities/event-handlers/base";
import _ from "lodash";
import { logger } from "@/common/logger";

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
    const orderCriteriaBuildQuery = Orders.buildCriteriaQuery(
      "orders",
      "token_set_id",
      false,
      "token_set_schema_hash"
    );

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
                  fill_source_id AS "event_fill_source_id",
                  wash_trading_score AS "event_wash_trading_score",
                  currency AS "pricing_currency",
                  price AS "pricing_price",
                  currency_price AS "pricing_currency_price",
                  usd_price AS "pricing_usd_price",
                  extract(epoch from created_at) AS "created_ts",
                  t.*,
                  o.*
                FROM fill_events_2
                LEFT JOIN LATERAL (
                    SELECT
                        tokens.name AS "token_name",
                        tokens.image AS "token_image",
                        tokens.media AS "token_media",
                        tokens.is_spam AS "token_is_spam",
                        collections.is_spam AS "collection_is_spam",
                        collections.id AS "collection_id",
                        collections.name AS "collection_name",
                        (collections.metadata ->> 'imageUrl')::TEXT AS "collection_image",
                        collections.image_version AS "collection_image_version",
                        collections.is_minting AS "event_collection_is_minting",
                        collection_mints.price AS "event_collection_mint_price"
                    FROM tokens
                    JOIN collections on collections.id = tokens.collection_id
                    LEFT JOIN collection_mints ON collection_mints.collection_id = collections.id
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

  static async generateActivities(events: NftTransferEventInfo[]): Promise<ActivityDocument[]> {
    const activities: ActivityDocument[] = [];

    const eventsFilter = [];

    for (const event of events) {
      eventsFilter.push(
        `('${_.replace(event.txHash, "0x", "\\x")}', '${event.logIndex}', '${event.batchIndex}')`
      );
    }

    const results = await idb.manyOrNone(
      `
                ${FillEventCreatedEventHandler.buildBaseQuery()}
                WHERE (tx_hash,log_index, batch_index) IN ($/eventsFilter:raw/);  
                `,
      { eventsFilter: _.join(eventsFilter, ",") }
    );

    for (const result of results) {
      try {
        const eventHandler = new FillEventCreatedEventHandler(
          result.event_tx_hash,
          result.event_log_index,
          result.event_batch_index
        );

        const activity = eventHandler.buildDocument(result);

        activities.push(activity);
      } catch (error) {
        logger.error(
          "fill-event-created-event-handler",
          JSON.stringify({
            topic: "generate-activities",
            message: `Error build document. error=${error}`,
            result,
            error,
          })
        );
      }
    }

    return activities;
  }
}
