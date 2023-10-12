import cron from "node-cron";
import { redlock } from "@/common/redis";
import { config } from "@/config/index";
import { tokenFlagStatusSyncJob } from "@/jobs/flag-status/token-flag-status-sync-job";
import { PendingFlagStatusSyncCollectionSlugs } from "@/models/pending-flag-status-sync-collection-slugs";
import { PendingFlagStatusSyncTokens } from "@/models/pending-flag-status-sync-tokens";
import { collectionSlugFlugStatusSyncJob } from "./collection-slug-flag-status";
import { PendingFlagStatusSyncContracts } from "@/models/pending-flag-status-sync-contracts";
import { contractFlugStatusSyncJob } from "./contract-flag-status";

if (config.doBackgroundWork && !config.disableFlagStatusRefreshJob) {
  cron.schedule(
    // Every second
    "*/1 * * * * *",
    async () =>
      await redlock
        .acquire(["flag-status-sync-cron"], (10 * 60 - 3) * 1000)
        .then(async () => {
          // check if a lock exists for tokens due to rate limiting
          const tokensCount = await PendingFlagStatusSyncTokens.count();
          if (tokensCount > 0) await tokenFlagStatusSyncJob.addToQueue();

          // check if a lock exists for collections due to rate limiting
          const slugCount = await PendingFlagStatusSyncCollectionSlugs.count();
          if (slugCount > 0) await collectionSlugFlugStatusSyncJob.addToQueue();

          const contractCount = await PendingFlagStatusSyncContracts.count();
          if (contractCount > 0) await contractFlugStatusSyncJob.addToQueue();
        })
        .catch(() => {
          // Skip any errors
        })
  );
}
