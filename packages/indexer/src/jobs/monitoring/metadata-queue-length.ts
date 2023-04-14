import cron from "node-cron";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import { logger } from "@/common/logger";

if (config.doBackgroundWork) {
  // Every 5 minutes log metadata queue length
  cron.schedule("*/5 * * * *", async () => {
    const queueLength = await redis.llen("pending-refresh-tokens:opensea");
    logger.info("metadata-queue-length", JSON.stringify({ queueLength }));
  });
}
