/* eslint-disable @typescript-eslint/no-explicit-any */

import { ActivityType } from "@/elasticsearch/indexes/activities/base";
import { getActivityHash } from "@/elasticsearch/indexes/activities/utils";
import { AskCreatedEventHandler } from "@/elasticsearch/indexes/activities/event-handlers/ask-created";

export class AskCancelledEventHandler extends AskCreatedEventHandler {
  getActivityType(): ActivityType {
    return ActivityType.ask_cancel;
  }

  getActivityId(): string {
    if (this.txHash && this.logIndex && this.batchIndex) {
      return getActivityHash(this.txHash, this.logIndex.toString(), this.batchIndex.toString());
    }

    return getActivityHash(ActivityType.ask_cancel, this.orderId);
  }
}
