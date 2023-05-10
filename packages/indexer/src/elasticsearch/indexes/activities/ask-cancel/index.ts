import { AskActivityBuilder } from "@/elasticsearch/indexes/activities/ask";

import { ActivityType } from "@/elasticsearch/indexes/activities";
import { getActivityHash } from "@/elasticsearch/indexes/activities/utils";
import { BuildInfo } from "@/elasticsearch/indexes/activities/base";

export class AskCancelActivityBuilder extends AskActivityBuilder {
  getActivityType(): ActivityType {
    return ActivityType.ask_cancel;
  }

  getId(buildInfo: BuildInfo): string {
    return getActivityHash(ActivityType.ask_cancel, buildInfo.order_id!);
  }
}
