/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";
import { redis } from "@/common/redis";

export class PendingExpiredBidActivitiesQueue {
  public key = "pending-expired-bid-activities-queue";

  public async add(ids: string[]) {
    if (_.isEmpty(ids)) {
      return;
    }

    return redis.rpush(this.key, ids);
  }

  public async get(count = 500): Promise<string[]> {
    return redis.lpop(this.key, count);
  }

  public async count(): Promise<number> {
    return await redis.llen(this.key);
  }
}
