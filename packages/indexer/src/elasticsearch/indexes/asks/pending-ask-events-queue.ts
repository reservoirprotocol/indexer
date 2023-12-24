/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";
import { redis } from "@/common/redis";

import { AskDocument } from "@/elasticsearch/indexes/asks/base";

export type AskEvent = {
  kind: "index" | "delete";
  info: {
    id: string;
    document?: AskDocument;
  };
};

export class PendingAskEventsQueue {
  public key = "pending-ask-events-queue";

  public constructor(indexName?: string) {
    this.key += indexName ? `:${indexName}` : "";
  }

  public async add(events: AskEvent[]) {
    if (_.isEmpty(events)) {
      return;
    }

    return redis.rpush(
      this.key,
      _.map(events, (event) => JSON.stringify(event))
    );
  }

  public async get(count = 500): Promise<AskEvent[]> {
    const events = await redis.lpop(this.key, count);

    if (events) {
      return _.map(events, (event) => JSON.parse(event) as AskEvent);
    }

    return [];
  }

  public async count(): Promise<number> {
    return await redis.llen(this.key);
  }
}
