/* eslint-disable @typescript-eslint/no-explicit-any */

import { redisWebsocketPublisher } from "@/common/redis";
import { KafkaEventHandler } from "./KafkaEventHandler";

export class IndexerBalanceEventsHandler extends KafkaEventHandler {
  topicName = "indexer.public.nft_balances";

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
