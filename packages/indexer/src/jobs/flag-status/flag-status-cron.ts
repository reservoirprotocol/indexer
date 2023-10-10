import cron from "node-cron";
import { doesLockExist, redlock } from "@/common/redis";
import { config } from "@/config/index";
import { tokenFlagStatusSyncJob } from "@/jobs/flag-status/token-flag-status-sync-job";
import { collectionFlagStatusSyncJob } from "@/jobs/flag-status/collection-flag-status-sync-job";
import { PendingFlagStatusSyncCollections } from "@/models/pending-flag-status-sync-collections";
import { PendingFlagStatusSyncTokens } from "@/models/pending-flag-status-sync-tokens";

if (config.doBackgroundWork) {
  cron.schedule(
    // Every second
    "*/1 * * * * *",
    async () =>
      await redlock
        .acquire(["flag-status-sync-cron"], (10 * 60 - 3) * 1000)
        .then(async () => {
          // check if a lock exists for tokens due to rate limiting
          if (!(await doesLockExist(tokenFlagStatusSyncJob.getLockName()))) {
            const tokensCount = await PendingFlagStatusSyncTokens.count();
            if (tokensCount > 0) await tokenFlagStatusSyncJob.addToQueue();
          }

          // check if a lock exists for collections due to rate limiting
          if (!(await doesLockExist(collectionFlagStatusSyncJob.getLockName()))) {
            const collectionsCount = await PendingFlagStatusSyncCollections.count();
            if (collectionsCount > 0) await collectionFlagStatusSyncJob.addToQueue();
          }
        })
        .catch(() => {
          // Skip any errors
        })
  );
}
