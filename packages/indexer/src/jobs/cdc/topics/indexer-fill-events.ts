/* eslint-disable @typescript-eslint/no-explicit-any */

import { redisWebsocketPublisher } from "@/common/redis";
import { KafkaCdcEventHandler } from "@/jobs/cdc/topics/kafka-cdc-event-handler-abstract";

export class IndexerFillEventsHandler extends KafkaCdcEventHandler {
  topicName = "indexer.public.fill_events_2";

  protected async handleInsert(payload: any): Promise<void> {
    if (!payload.after) {
      return;
    }

    await redisWebsocketPublisher.publish(
      "events",
      JSON.stringify({
        event: "sell.created.v2",
        tags: {},
        data: payload.after,
      })
    );
  }

  protected async handleUpdate(payload: any): Promise<void> {
    if (!payload.after) {
      return;
    }

    await redisWebsocketPublisher.publish(
      "events",
      JSON.stringify({
        event: "sell.updated.v2",
        tags: {},
        data: payload.after,
      })
    );
  }

  protected async handleDelete(): Promise<void> {
    // probably do nothing here
  }
}
