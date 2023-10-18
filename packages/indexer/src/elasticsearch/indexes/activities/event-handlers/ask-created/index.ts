/* eslint-disable @typescript-eslint/no-explicit-any */

import { idb } from "@/common/db";

import { ActivityDocument, ActivityType } from "@/elasticsearch/indexes/activities/base";
import { getActivityHash } from "@/elasticsearch/indexes/activities/utils";
import { Orders } from "@/utils/orders";
import {
  BaseActivityEventHandler,
  OrderEventInfo,
} from "@/elasticsearch/indexes/activities/event-handlers/base";
import _ from "lodash";
import { logger } from "@/common/logger";

export class AskCreatedEventHandler extends BaseActivityEventHandler {
  public orderId: string;
  public txHash?: string;
  public logIndex?: number;
  public batchIndex?: number;

  constructor(orderId: string, txHash?: string, logIndex?: number, batchIndex?: number) {
    super();

    this.orderId = orderId;
    this.txHash = txHash;
    this.logIndex = logIndex;
    this.batchIndex = batchIndex;
  }

  async generateActivity(): Promise<ActivityDocument> {
    const data = await idb.oneOrNone(
      `
          ${AskCreatedEventHandler.buildBaseQuery()}
          WHERE id = $/orderId/
          LIMIT 1;
        `,
      {
        orderId: this.orderId,
      }
    );

    return this.buildDocument(data);
  }
  getActivityType(): ActivityType {
    return ActivityType.ask;
  }

  getActivityId(): string {
    if (this.txHash && this.logIndex && this.batchIndex) {
      return getActivityHash(this.txHash, this.logIndex.toString(), this.batchIndex.toString());
    }

    return getActivityHash(ActivityType.ask, this.orderId);
  }

  public static buildBaseQuery() {
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
          (orders.quantity_filled + orders.quantity_remaining) AS "amount",
          orders.source_id_int AS "order_source_id_int",
          orders.fee_bps AS "pricing_fee_bps",
          (${orderCriteriaBuildQuery}) AS "order_criteria",
          extract(epoch from orders.created_at) AS "created_ts",
          extract(epoch from orders.updated_at) AS "updated_ts",
          extract(epoch from orders.originated_at) AS "originated_ts",
          DATE_PART('epoch', LOWER(orders.valid_between)) AS "valid_from",
          t.*
        FROM orders
        LEFT JOIN LATERAL (
                    SELECT
                        tokens.token_id,
                        tokens.name AS "token_name",
                        tokens.image AS "token_image",
                        tokens.media AS "token_media",
                        collections.id AS "collection_id",
                        collections.name AS "collection_name",
                        (collections.metadata ->> 'imageUrl')::TEXT AS "collection_image"
                    FROM tokens
                    JOIN collections on collections.id = tokens.collection_id
                    WHERE decode(substring(split_part(orders.token_set_id, ':', 2) from 3), 'hex') = tokens.contract
                    AND (split_part(orders.token_set_id, ':', 3)::NUMERIC(78, 0)) = tokens.token_id
                    LIMIT 1
                 ) t ON TRUE`;
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  parseEvent(data: any) {
    data.timestamp = data.originated_ts
      ? Math.floor(data.originated_ts)
      : Math.floor(data.created_ts);
  }

  static async generateActivities(events: OrderEventInfo[]): Promise<ActivityDocument[]> {
    const activities: ActivityDocument[] = [];

    const eventsFilter = [];

    for (const event of events) {
      eventsFilter.push(`('${event.orderId}')`);
    }

    const results = await idb.manyOrNone(
      `
                ${AskCreatedEventHandler.buildBaseQuery()}
                WHERE (id) IN ($/eventsFilter:raw/);  
                `,
      { eventsFilter: _.join(eventsFilter, ",") }
    );

    for (const result of results) {
      try {
        const event = events.find((event) => event.orderId === result.order_id);

        const eventHandler = new AskCreatedEventHandler(
          result.order_id,
          event?.txHash,
          event?.logIndex,
          event?.batchIndex
        );

        const activity = eventHandler.buildDocument(result);

        activities.push(activity);
      } catch (error) {
        logger.error(
          "ask-created-event-handler",
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
