/* eslint-disable @typescript-eslint/no-explicit-any */
import { KafkaEventHandler } from "./KafkaEventHandler";
import { redis } from "@/common/redis";

import { logger } from "@/common/logger";
import {
  WebsocketEventKind,
  WebsocketEventRouter,
} from "@/jobs/websocket-events/websocket-event-router";
import { redb } from "@/common/db";

export class IndexerCollectionsHandler extends KafkaEventHandler {
  topicName = "indexer.public.collections";

  protected async handleInsert(payload: any): Promise<void> {
    if (!payload.after) {
      return;
    }

    await WebsocketEventRouter({
      eventInfo: {
        before: payload.before,
        after: payload.after,
        trigger: "insert",
      },
      eventKind: WebsocketEventKind.CollectionEvent,
    });
  }

  protected async handleUpdate(payload: any): Promise<void> {
    if (!payload.after) {
      return;
    }

    await WebsocketEventRouter({
      eventInfo: {
        before: payload.before,
        after: payload.after,
        trigger: "update",
      },
      eventKind: WebsocketEventKind.CollectionEvent,
    });
    logger.info("top-selling-collections", `updating collection ${payload.after.id}`);

    const collectionKey = `collection-cache:v1:${payload.after.id}`;

    const cachedCollection = await redis.get(collectionKey);

    if (cachedCollection !== null) {
      // If the collection exists, fetch the on_sale_count
      const listedCountQuery = `
        SELECT
          COUNT(*) AS on_sale_count
        FROM tokens
        WHERE tokens.collection_id = ${payload.after.id}
          AND tokens.floor_sell_value IS NOT NULL
      `;

      const listCountResult = await redb.one(listedCountQuery);
      const listCount = listCountResult.on_sale_count;

      const updatedPayload = {
        ...payload.after,
        on_sale_count: listCount,
      };

      await redis.set(collectionKey, JSON.stringify(updatedPayload), "XX");
    }

    logger.info("top-selling-collections", `updated collection ${payload.after.id}`);
  }

  protected async handleDelete(): Promise<void> {
    // probably do nothing here
  }
}
