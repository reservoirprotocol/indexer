import cron from "node-cron";
import { config } from "@/config/index";
import { logger } from "@/common/logger";
import { idb } from "@/common/db";

if (config.doBackgroundWork) {
  cron.schedule("*/5 * * * *", async () => {
    // Log sales latency for all fill events in last 5 minutes
    const results = await idb.manyOrNone(
      `
            SELECT EXTRACT(epoch FROM created_at) - "timestamp" AS latency
            FROM fill_events_2
            WHERE created_at > NOW() - INTERVAL '5 minutes'
      `
    );

    for (const result of results) {
      logger.info("sales-latency", JSON.stringify(result));
    }
  });
}
