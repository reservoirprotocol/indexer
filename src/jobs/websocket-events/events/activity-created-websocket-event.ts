import { idb } from "@/common/db";
import * as Pusher from "pusher";
import { formatEth } from "@/common/utils";
import { Orders } from "@/utils/orders";
import { config } from "@/config/index";
import { Sources } from "@/models/sources";

export class ActivityCreatedWebsocketEvent {
  public static async triggerEvent(data: ActivityCreatedWebsocketEventInfo) {
    const orderCriteriaBuildQuery = Orders.buildCriteriaQuery("orders", "token_set_id", false);

    const metadataQuery = `
             LEFT JOIN LATERAL (
                SELECT name AS "token_name", image AS "token_image"
                FROM tokens
                WHERE activities.contract = tokens.contract
                AND activities.token_id = tokens.token_id
             ) t ON TRUE
             LEFT JOIN LATERAL (
                SELECT name AS "collection_name", metadata AS "collection_metadata"
                FROM collections
                WHERE activities.collection_id = collections.id
             ) c ON TRUE
             LEFT JOIN LATERAL (
                SELECT 
                    source_id_int AS "order_source_id_int",
                    side AS "order_side",
                    kind AS "order_kind",
                    (${orderCriteriaBuildQuery}) AS "order_criteria"
                FROM orders
                WHERE activities.order_id = orders.id
             ) o ON TRUE`;

    const activity = await idb.oneOrNone(
      `
              SELECT *
              FROM activities
              ${metadataQuery}
              WHERE id = $/activityId/
            `,
      { activityId: data.activityId }
    );

    const server = new Pusher.default({
      appId: config.websocketServerAppId,
      key: config.websocketServerAppKey,
      secret: config.websocketServerAppSecret,
      host: config.websocketServerHost,
    });

    const sources = await Sources.getInstance();

    const orderSource = activity.order?.sourceIdInt
      ? sources.get(activity.order.sourceIdInt)
      : undefined;

    const payload = {
      type: activity.type,
      contract: activity.contract,
      collectionId: activity.collectionId,
      tokenId: activity.tokenId,
      fromAddress: activity.fromAddress,
      toAddress: activity.toAddress,
      price: formatEth(activity.price),
      amount: activity.amount,
      timestamp: activity.eventTimestamp,
      txHash: activity.metadata.transactionHash,
      logIndex: activity.metadata.logIndex,
      batchIndex: activity.metadata.batchIndex,
      order: activity.order?.id
        ? {
            id: activity.order.id,
            side: activity.order.side
              ? activity.order.side === "sell"
                ? "ask"
                : "bid"
              : undefined,
            source: orderSource
              ? {
                  domain: orderSource?.domain,
                  name: orderSource?.getTitle(),
                  icon: orderSource?.getIcon(),
                }
              : undefined,
            criteria: activity.order.criteria,
          }
        : undefined,
    };

    await server.trigger("activities", "new-activity", JSON.stringify(payload));
  }
}

export type ActivityCreatedWebsocketEventInfo = {
  activityId: number;
};
