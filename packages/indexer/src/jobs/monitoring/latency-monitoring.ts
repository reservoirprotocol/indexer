import cron from "node-cron";
import { config } from "@/config/index";
import { logger } from "@/common/logger";
import { redb } from "@/common/db";
import { fromBuffer } from "@/common/utils";

if (config.doBackgroundWork) {
  cron.schedule("*/1 * * * *", async () => {
    // Log sales latency for all fill events in last minute
    const results = await redb.manyOrNone(
      `
            SELECT EXTRACT(epoch FROM created_at) - "timestamp" AS latency, tx_hash, log_index, batch_index, block, block_hash, order_kind
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
          tx_hash: fromBuffer(result.tx_hash),
          log_index: result.log_index,
          batch_index: result.batch_index,
          block: result.block,
          block_hash: fromBuffer(result.block_hash),
          order_kind: result.order_kind,
        })
      );
    }
  });
}
