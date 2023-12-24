/* eslint-disable @typescript-eslint/no-explicit-any */

import { KafkaEventHandler } from "./KafkaEventHandler";
import {
  WebsocketEventKind,
  WebsocketEventRouter,
} from "@/jobs/websocket-events/websocket-event-router";
import { updateUserCollectionsJob } from "@/jobs/nft-balance-updates/update-user-collections-job";

export class IndexerTransferEventsHandler extends KafkaEventHandler {
  topicName = "indexer.public.nft_transfer_events";

  protected async handleInsert(payload: any, offset: string): Promise<void> {
    if (!payload.after) {
      return;
    }

    await WebsocketEventRouter({
      eventInfo: {
        before: payload.before,
        after: payload.after,
        trigger: "insert",
        offset,
      },
      eventKind: WebsocketEventKind.TransferEvent,
    });

    // Update the user collections
    await updateUserCollectionsJob.addToQueue([
      {
        fromAddress: payload.after.from,
        toAddress: payload.after.to,
        contract: payload.after.address,
        tokenId: payload.after.token_id,
        amount: payload.after.amount,
      },
    ]);
  }

  protected async handleUpdate(payload: any, offset: string): Promise<void> {
    if (!payload.after) {
      return;
    }

    await WebsocketEventRouter({
      eventInfo: {
        before: payload.before,
        after: payload.after,
        trigger: "update",
        offset,
      },
      eventKind: WebsocketEventKind.TransferEvent,
    });

    const isDeleted = payload.before.is_deleted !== payload.after.is_deleted;

    if (isDeleted) {
      // If the transfer was marked as deleted revert the user collection update
      await updateUserCollectionsJob.addToQueue([
        {
          fromAddress: payload.after.to,
          toAddress: payload.after.from,
          contract: payload.after.address,
          tokenId: payload.after.token_id,
          amount: payload.after.amount,
        },
      ]);
    }
  }

  protected async handleDelete(): Promise<void> {
    // probably do nothing here
  }
}
