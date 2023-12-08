/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";
import { redis } from "@/common/redis";

import { CollectionDocument } from "@/elasticsearch/indexes/collections/base";

export type CollectionEvent = {
  kind: "index" | "delete";
  document?: Partial<CollectionDocument>;
  _id: string;
};

export class PendingCollectionEventsQueue {
  public key = "pending-collection-events-queue";

  public constructor(indexName?: string) {
    this.key += indexName ? `:${indexName}` : "";
  }

  public async add(events: CollectionEvent[]) {
    if (_.isEmpty(events)) {
      return;
    }

    return redis.rpush(
      this.key,
      _.map(events, (event) => JSON.stringify(event))
    );
  }

  public async get(count = 500): Promise<CollectionEvent[]> {
    const events = await redis.lpop(this.key, count);

    if (events) {
      return _.map(events, (event) => JSON.parse(event) as CollectionEvent);
    }

    return [];
  }

  public async count(): Promise<number> {
    return await redis.llen(this.key);
  }
}
