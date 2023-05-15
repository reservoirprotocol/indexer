/* eslint-disable @typescript-eslint/no-explicit-any */

import { ActivityType } from "@/elasticsearch/indexes/activities/base";
import { getActivityHash } from "@/elasticsearch/indexes/activities/utils";
import { BidCreatedEventHandler } from "@/elasticsearch/indexes/activities/event-handlers/bid-created";

export class BidCancelledEventHandler extends BidCreatedEventHandler {
  getActivityType(): ActivityType {
    return ActivityType.bid_cancel;
  }

  getActivityId(): string {
    if (this.txHash && this.logIndex && this.batchIndex) {
      return getActivityHash(this.txHash, this.logIndex.toString(), this.batchIndex.toString());
    }

    return getActivityHash(ActivityType.bid_cancel, this.orderId);
  }
}
