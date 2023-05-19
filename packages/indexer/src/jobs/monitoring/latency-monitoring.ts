import cron from "node-cron";
import { config } from "@/config/index";
import { logger } from "@/common/logger";
import { redb } from "@/common/db";

if (config.doBackgroundWork) {
  cron.schedule("*/1 * * * *", async () => {
    // Log sales latency for all fill events in last minute
    const results = await redb.manyOrNone(
      `
            SELECT EXTRACT(epoch FROM created_at) - "timestamp" AS latency
            FROM fill_events_2
            WHERE created_at > NOW() - INTERVAL '1 minute'
            LIMIT 1000
      `
    );

    for (const result of results) {
      logger.info(
        "sales-latency",
        JSON.stringify({
          latency: Number(result.latency),
        })
      );
    }
  });
}
