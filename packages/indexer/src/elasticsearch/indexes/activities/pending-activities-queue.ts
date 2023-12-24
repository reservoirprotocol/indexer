/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";
import { redis } from "@/common/redis";

import { ActivityDocument } from "@/elasticsearch/indexes/activities/base";

export class PendingActivitiesQueue {
  public key = "pending-activities-queue";

  public constructor(indexName?: string) {
    this.key += indexName ? `:${indexName}` : "";
  }

  public async add(activities: ActivityDocument[]) {
    if (_.isEmpty(activities)) {
      return;
    }

    return redis.rpush(
      this.key,
      _.map(activities, (event) => JSON.stringify(event))
    );
  }

  public async get(count = 500): Promise<ActivityDocument[]> {
    const activities = await redis.lpop(this.key, count);

    if (activities) {
      return _.map(activities, (activity) => JSON.parse(activity) as ActivityDocument);
    }

    return [];
  }

  public async count(): Promise<number> {
    return await redis.llen(this.key);
  }
}
