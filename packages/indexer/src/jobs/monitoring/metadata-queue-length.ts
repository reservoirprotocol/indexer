import cron from "node-cron";
import { config } from "@/config/index";
import { logger } from "@/common/logger";
import { PendingRefreshTokens } from "@/models/pending-refresh-tokens";

if (config.doBackgroundWork) {
  // Every 5 minutes log metadata queue length
  cron.schedule("*/5 * * * *", async () => {
    for (const method of ["opensea"]) {
      const pendingRefreshTokens = new PendingRefreshTokens(method);
      const queueLength = await pendingRefreshTokens.length();
      logger.info("metadata-queue-length", JSON.stringify({ method, queueLength }));
    }
  });
}
