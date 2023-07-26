import cron from "node-cron";

import { logger } from "@/common/logger";
import { baseProvider, safeWebSocketSubscription } from "@/common/provider";
import { redlock } from "@/common/redis";
import { config } from "@/config/index";
import { getNetworkSettings } from "@/config/network";
import { eventsSyncRealtimeJob } from "@/jobs/events-sync/events-sync-realtime-job";

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
        } catch (error) {
          logger.error("events-sync-catchup", `Failed to catch up events: ${error}`);
        }
      });
    });
  } else if (config.master) {
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
              if (networkSettings.enableWebSocket || !config.master) {
                return;
              }

              const block = await baseProvider.getBlockNumber();
              await eventsSyncRealtimeJob.addToQueue({ block });

              logger.info("events-sync-catchup", "Catching up events");
            } catch (error) {
              logger.error("events-sync-catchup", `Failed to catch up events: ${error}`);
            }
          })
          .catch(() => {
            // Skip on any errors
          })
    );
  }
}
