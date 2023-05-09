import cron from "node-cron";
import { config } from "@/config/index";
import { logger } from "@/common/logger";
import { idb } from "@/common/db";

if (config.doBackgroundWork && config.chainId === 56) {
  cron.schedule("*/5 * * * *", async () => {
    // Log backfill progress for BSC
    const result = await idb.oneOrNone(
      `
        SELECT MAX(block) AS currentBlock,
        MIN(block) AS earliestBlock
        FROM nft_transfer_events
      `
    );

    logger.info("backfill-progress", JSON.stringify(result));
  });
}
