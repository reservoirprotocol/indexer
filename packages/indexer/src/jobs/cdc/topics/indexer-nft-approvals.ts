/* eslint-disable @typescript-eslint/no-explicit-any */
import { redisWebsocketPublisher } from "@/common/redis";
import { KafkaEventHandler } from "./KafkaEventHandler";

export class IndexerApprovalEventsHandler extends KafkaEventHandler {
  topicName = "indexer.public.nft_approvals";

  protected async handleInsert(payload: any): Promise<void> {
    if (!payload.after) {
      return;
    }

    await redisWebsocketPublisher.publish(
      "events",
      JSON.stringify({
        event: "approval.created.v2",
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
        event: "approval.updated.v2",
        tags: {},
        data: payload.after,
      })
    );
  }

  protected async handleDelete(): Promise<void> {
    // probably do nothing here
  }
}
