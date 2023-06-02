import cron from "node-cron";

import { logger } from "@/common/logger";
import { safeWebSocketSubscription } from "@/common/provider";
import { redlock } from "@/common/redis";
import { config } from "@/config/index";
import { getNetworkSettings } from "@/config/network";
import * as realtimeEventsSync from "@/jobs/events-sync/realtime-queue";
import * as realtimeEventsSyncV2 from "@/jobs/events-sync/realtime-queue-v2";

// For syncing events we have two separate job queues. One is for
// handling backfilling of past event while the other one handles
// realtime syncing of events. The reason for having these two be
// separated is that we don't want any ongoing backfilling action
// to delay realtime syncing (which tries to catch up to the head
// of the blockchain). Apart from these, we also have several job
// queues (that are single-threaded) which act as writing buffers
// for queries that are prone to database deadlocks (these are ft
// and nft transfer events writes which can run into deadlocks on
// concurrent upserts of the balances):
// https://stackoverflow.com/questions/46366324/postgres-deadlocks-on-concurrent-upserts

import "@/jobs/events-sync/backfill-queue";
import "@/jobs/events-sync/block-check-queue";
import "@/jobs/events-sync/process/backfill";
import "@/jobs/events-sync/process/realtime";
import "@/jobs/events-sync/realtime-queue";
import "@/jobs/events-sync/realtime-queue-v2";
import "@/jobs/events-sync/write-buffers/ft-transfers";
import "@/jobs/events-sync/write-buffers/nft-transfers";

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork && config.catchup) {
  const networkSettings = getNetworkSettings();

  // Keep up with the head of the blockchain by polling for new blocks every once in a while
  cron.schedule(
    `*/${networkSettings.realtimeSyncFrequencySeconds} * * * * *`,
    async () =>
      await redlock
        .acquire(
          ["events-sync-catchup-lock"],
          (networkSettings.realtimeSyncFrequencySeconds - 1) * 1000
        )
        .then(async () => {
          try {
            await realtimeEventsSync.addToQueue();
            logger.info("events-sync-catchup", "Catching up events");
          } catch (error) {
            logger.error("events-sync-catchup", `Failed to catch up events: ${error}`);
          }
        })
        .catch(() => {
          // Skip on any errors
        })
  );

  // MASTER ONLY
  if (config.master && networkSettings.enableWebSocket) {
    // Besides the manual polling of events via the above cron job
    // we're also integrating WebSocket subscriptions to fetch the
    // latest events as soon as they're hapenning on-chain. We are
    // still keeping the manual polling though to ensure no events
    // are being missed.
    safeWebSocketSubscription(async (provider) => {
      provider.on("block", async (block) => {
        logger.info("events-sync-catchup", `Detected new block ${block}`);

        try {
          await realtimeEventsSync.addToQueue();
          if (config.enableRealtimeV2BlockQueue) {
            await realtimeEventsSyncV2.addToQueue({ block });
          }
        } catch (error) {
          logger.error("events-sync-catchup", `Failed to catch up events: ${error}`);
        }
      });
    });
  }
}
