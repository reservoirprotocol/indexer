/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  ActivityBuilder,
  ActivityDocument,
  ActivityType,
} from "@/elasticsearch/indexes/activities/base";

export abstract class BaseActivityEventHandler {
  abstract getActivityId(data: any): string;

  abstract getActivityType(data: any): ActivityType;

  abstract parseEvent(data: any): void;

  public buildDocument(data: any): ActivityDocument {
    this.parseEvent(data);

    data.id = this.getActivityId(data);
    data.type = this.getActivityType(data);

    return new ActivityBuilder().buildDocument(data);
  }
}
