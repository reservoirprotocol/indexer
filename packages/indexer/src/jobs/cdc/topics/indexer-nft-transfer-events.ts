/* eslint-disable @typescript-eslint/no-explicit-any */

import { redisWebsocketPublisher } from "@/common/redis";
import { KafkaEventHandler } from "./KafkaEventHandler";

export class IndexerTransferEventsHandler extends KafkaEventHandler {
  topicName = "indexer.public.nft_transfer_events";

  protected async handleInsert(payload: any): Promise<void> {
    if (!payload.after) {
      return;
    }

    await redisWebsocketPublisher.publish(
      "events",
      JSON.stringify({
        event: "transfer.created.v2",
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
        event: "transfer.updated.v2",
        tags: {},
        data: payload.after,
      })
    );
  }

  protected async handleDelete(): Promise<void> {
    // probably do nothing here
  }
}
