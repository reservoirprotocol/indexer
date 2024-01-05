import cron from "node-cron";
import { config } from "@/config/index";
import { logger } from "@/common/logger";
import { idb, edb, redb, ridb } from "@/common/db";

if (config.doBackgroundWork && [1].includes(config.chainId)) {
  cron.schedule("*/30 * * * * *", async () => {
    logger.info(
      "db-connections-monitoring",
      JSON.stringify({
        message: `DB connection status`,
        idb: {
          totalCount: idb.$pool.totalCount,
          waitingCount: idb.$pool.waitingCount,
          idleCount: idb.$pool.idleCount,
        },
        edb: {
          totalCount: edb.$pool.totalCount,
          waitingCount: edb.$pool.waitingCount,
          idleCount: edb.$pool.idleCount,
        },
        ridb: {
          totalCount: ridb.$pool.totalCount,
          waitingCount: ridb.$pool.waitingCount,
          idleCount: ridb.$pool.idleCount,
        },
        redb: {
          totalCount: redb.$pool.totalCount,
          waitingCount: redb.$pool.waitingCount,
          idleCount: redb.$pool.idleCount,
        },
      })
    );
  });
}
