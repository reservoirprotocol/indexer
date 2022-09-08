import _ from "lodash";
import { redis } from "@/common/redis";

export type SyncFlagStatusJobInfo =
  | {
      kind: "collection";
      data: {
        collectionId: string;
        backfill: boolean;
      };
    }
  | {
      kind: "token";
      data: {
        collectionId: string;
        contract: string;
        tokenId: string;
        tokenIsFlagged: number;
      };
    };

/**
 * Class that manage redis list of tokens, pending flag status sync
 */
export class PendingFlagStatusSyncJobs {
  public key = "pending-flag-status-sync-jobs";

  public async add(jobs: SyncFlagStatusJobInfo[], prioritized = false) {
    if (prioritized) {
      return await redis.lpush(
        this.key,
        _.map(jobs, (job) => JSON.stringify(job))
      );
    } else {
      return await redis.rpush(
        this.key,
        _.map(jobs, (job) => JSON.stringify(job))
      );
    }
  }

  public async get(count = 1): Promise<SyncFlagStatusJobInfo[]> {
    const jobs = await redis.lpop(this.key, count);
    if (jobs) {
      return _.map(jobs, (job) => JSON.parse(job) as SyncFlagStatusJobInfo);
    }

    return [];
  }

  public async count(): Promise<number> {
    return await redis.llen(this.key);
  }
}
