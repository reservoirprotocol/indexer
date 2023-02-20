import cron from "node-cron";

import { logger } from "@/common/logger";
import { redlock } from "@/common/redis";
import { config } from "@/config/index";
import * as arweaveSyncPending from "@/jobs/arweave-sync/pending-queue";
import * as arweaveSyncRealtime from "@/jobs/arweave-sync/realtime-queue";

import "@/jobs/arweave-sync/backfill-queue";
import "@/jobs/arweave-sync/pending-queue";
import "@/jobs/arweave-sync/realtime-queue";

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork && config.catchup && !config.disableOrders) {
  // In the same way as we do for syncing events, we poll
  // Arweave periodically to fetch any new blocks.
  cron.schedule(
    "*/1 * * * *",
    async () =>
      await redlock
        .acquire(["arweave-sync-catchup-lock"], (60 - 5) * 1000)
        .then(async () => {
          logger.info("arweave-sync-catchup", "Catching up Arweave data");

          try {
            await arweaveSyncRealtime.addToQueue();
          } catch (error) {
            logger.error("arweave-sync-catchup", `Failed to catch up Arweave data: ${error}`);
          }
        })
        .catch(() => {
          // Skip on any errors
        })
  );

  // We should poll Arweave very often in order to get any new pending
  // transactions. This will allow us to get any incoming data as soon
  // as it hits the Arweave mempool.
  cron.schedule(
    "*/30 * * * * *",
    async () =>
      await redlock
        .acquire(["arweave-sync-pending-lock"], 25 * 1000)
        .then(async () => {
          logger.info("arweave-sync-pending", "Syncing pending Arweave data");

          try {
            await arweaveSyncPending.addToQueue();
          } catch (error) {
            logger.error("arweave-sync-pending", `Failed to sync pending Arweave data: ${error}`);
          }
        })
        .catch(() => {
          // Skip on any errors
        })
  );
}
