import cron from "node-cron";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { redlock } from "@/common/redis";
import { fromBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { Collections } from "@/models/collections";

// Periodically check cache values against the underlying
// data backing those caches in order to ensure there are
// no inconsistencies between them. Some examples of what
// we might want to check:
// - tokens cached `top_buy` and `floor_sell`
// - TODO: token sets cached `top_buy`

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  cron.schedule(
    "*/30 * * * * *",
    async () =>
      await redlock.acquire(["cache-check-lock"], (30 - 5) * 1000).then(async () => {
        logger.info("cache-check", "Checking cache consistency");

        try {
          // Randomly check the tokens `floor_sell` caches

          const results: {
            id: string;
            contract: Buffer;
            is_wrong: boolean;
          }[] = await redb.manyOrNone(
            `
                SELECT * FROM (
                  WITH c AS (
                    SELECT
                      collections.id,
                      collections.contract
                    FROM collections
                    ORDER BY collections.day1_volume DESC
                    LIMIT 1000
                  )
                  SELECT
                    c.*
                  FROM c
                  ORDER BY random()
                  LIMIT 10
                ) x
                LEFT JOIN LATERAL (
                  WITH w AS (
                    SELECT
                      tokens.contract,
                      tokens.token_id,
                      tokens.floor_sell_value,
                      y.value
                    FROM tokens
                    LEFT JOIN LATERAL (
                      SELECT
                        orders.value
                      FROM orders
                      JOIN token_sets_tokens
                        ON orders.token_set_id = token_sets_tokens.token_set_id
                      WHERE token_sets_tokens.contract = tokens.contract
                        AND token_sets_tokens.token_id = tokens.token_id
                        AND orders.side = 'sell'
                        AND orders.fillability_status = 'fillable'
                        AND orders.approval_status = 'approved'
                      ORDER BY orders.value
                      LIMIT 1
                    ) y ON TRUE
                    WHERE tokens.collection_id = x.id
                    ORDER BY tokens.floor_sell_value
                    LIMIT 10
                  )
                  SELECT EXISTS(
                    SELECT FROM w WHERE w.floor_sell_value != w.value
                  ) AS is_wrong
                ) z ON TRUE
              `
          );
          for (const { id, contract, is_wrong } of results) {
            if (is_wrong) {
              logger.error(
                "cache-check",
                `Detected wrong tokens "floor_sell" cache for collection ${id}`
              );

              // Trigger a fix for the wrong cache
              await Collections.recalculateContractFloorSell(fromBuffer(contract));
            }
          }
        } catch (error) {
          logger.error("cache-check", `Failed to check cache consistency: ${error}`);
        }
      })
  );
}
