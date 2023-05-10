import { BidActivityBuilder } from "@/elasticsearch/indexes/activities/bid";

import { ActivityType } from "@/elasticsearch/indexes/activities";
import { getActivityHash } from "@/elasticsearch/indexes/activities/utils";
import { BuildInfo } from "@/elasticsearch/indexes/activities/base";

export class BidCancelActivityBuilder extends BidActivityBuilder {
  getActivityType(): ActivityType {
    return ActivityType.bid_cancel;
  }

  getId(buildInfo: BuildInfo): string {
    return getActivityHash(ActivityType.bid_cancel, buildInfo.order_id!);
  }
}
