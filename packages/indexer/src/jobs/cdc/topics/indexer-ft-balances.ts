/* eslint-disable @typescript-eslint/no-explicit-any */

import { redisWebsocketPublisher } from "@/common/redis";
import { KafkaCdcEventHandler } from "@/jobs/cdc/topics/kafka-cdc-event-handler-abstract";

export class IndexerBalanceEventsHandler extends KafkaCdcEventHandler {
  topicName = "indexer.public.ft_balances";

  protected async handleInsert(payload: any): Promise<void> {
    if (!payload.after) {
      return;
    }

    await redisWebsocketPublisher.publish(
      "events",
      JSON.stringify({
        event: "balance.created.v2",
        tags: {},
        data: payload.after,
      })
    );
  }

  protected async handleUpdate(payload: any): Promise<void> {
    // probably do nothing here
    if (!payload.after) {
      return;
    }

    await redisWebsocketPublisher.publish(
      "events",
      JSON.stringify({
        event: "balance.updated.v2",
        tags: {},
        data: payload.after,
      })
    );
  }

  protected async handleDelete(): Promise<void> {
    // probably do nothing here
  }
}
