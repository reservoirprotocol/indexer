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
      kind: "tokens";
      data: {
        collectionId: string;
        contract: string;
        tokens: { tokenId: string; tokenIsFlagged: number }[];
      };
    };

/**
 * Class that manage redis list of tokens, pending flag status sync
 */
export class PendingFlagStatusSyncJobs {
  public key = "pending-flag-status-sync-jobs";

  public async add(jobs: SyncFlagStatusJobInfo[], prioritized = false) {
    if (prioritized) {
      return await redis.zadd(
        this.key,
        "NX",
        ...jobs.map((job) => ["-inf", JSON.stringify(job)]).flat()
      );
    } else {
      return await redis.zadd(
        this.key,
        "NX",
        ...jobs.map((job) => [Date.now(), JSON.stringify(job)]).flat()
      );
    }
  }

  public async next(): Promise<SyncFlagStatusJobInfo | null> {
    const result = await redis.zpopmin(this.key);
    return result.length ? JSON.parse(result[0]) : null;
  }
}
