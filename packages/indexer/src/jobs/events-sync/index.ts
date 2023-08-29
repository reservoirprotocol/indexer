import { logger } from "@/common/logger";
import { safeWebSocketSubscription } from "@/common/provider";
import { config } from "@/config/index";
import { getNetworkSettings } from "@/config/network";
import { eventsSyncRealtimeJob } from "@/jobs/events-sync/events-sync-realtime-job";
import { checkForMissingBlocks } from "@/events-sync/syncEventsV2";

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

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork && config.catchup) {
  const networkSettings = getNetworkSettings();
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
          await eventsSyncRealtimeJob.addToQueue({ block });
          await checkForMissingBlocks(block);
        } catch (error) {
          logger.error("events-sync-catchup", `Failed to catch up events: ${error}`);
        }
      });
    });
  }
}
