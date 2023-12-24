/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";
import { redis } from "@/common/redis";
import { EventKind } from "@/jobs/elasticsearch/activities/process-activity-event-job";
import {
  NftTransferEventInfo,
  OrderEventInfo,
} from "@/elasticsearch/indexes/activities/event-handlers/base";

export class PendingActivityEventsQueue {
  public key = "pending-activity-events-queue";

  public constructor(eventKind: EventKind) {
    this.key += `:${eventKind}`;
  }

  public async add(events: { kind: EventKind; data: NftTransferEventInfo | OrderEventInfo }[]) {
    if (_.isEmpty(events)) {
      return;
    }

    return redis.rpush(
      this.key,
      _.map(events, (event) => JSON.stringify(event))
    );
  }

  public async get(
    count = 500
  ): Promise<{ kind: EventKind; data: NftTransferEventInfo | OrderEventInfo }[]> {
    const events = await redis.lpop(this.key, count);

    if (events) {
      return _.map(events, (event) => JSON.parse(event));
    }

    return [];
  }

  public async count(): Promise<number> {
    return await redis.llen(this.key);
  }
}
