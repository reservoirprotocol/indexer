import cron from "node-cron";

import { inject } from "@/api/index";
import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { redlock } from "@/common/redis";
import { fromBuffer } from "@/common/utils";
import { config } from "@/config/index";

// Periodically check cache values against the underlying
// data backing those caches in order to ensure there are
// no inconsistencies between them. Some examples of what
// we might want to check:
// - tokens cached `top_buy` and `floor_sell`
// - token sets cached `top_buy`

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  cron.schedule(
    "*/5 * * * *",
    async () =>
      await redlock.acquire(["cache-check-lock"], (5 * 60 - 5) * 1000).then(async () => {
        logger.info("cache-check", "Checking cache consistency");

        try {
          // Randomly check the tokens `floor_sell` caches
          {
            const results: {
              id: string;
              contract: Buffer;
              is_wrong: boolean;
            }[] = await redb.manyOrNone(
              `
                  SELECT * FROM (
                    SELECT
                      "c"."id",
                      "c"."contract"
                    FROM "collections" "c"
                    TABLESAMPLE system_rows(5)
                  ) "x"
                  LEFT JOIN LATERAL (
                    WITH "w" AS (
                      SELECT
                        "t"."contract",
                        "t"."token_id",
                        "t"."floor_sell_value",
                        "y"."value"
                      FROM "tokens" "t"
                      LEFT JOIN LATERAL (
                        SELECT "o"."value" FROM "orders" "o"
                        JOIN "token_sets_tokens" "tst"
                          ON "o"."token_set_id" = "tst"."token_set_id"
                        WHERE "tst"."contract" = "t"."contract"
                          AND "tst"."token_id" = "t"."token_id"
                          AND "o"."side" = 'sell'
                          AND "o"."fillability_status" = 'fillable'
                          AND "o"."approval_status" = 'approved'
                        ORDER BY "o"."value"
                        LIMIT 1
                      ) "y" ON TRUE
                      WHERE "t"."collection_id" = "x"."id"
                      ORDER BY "t"."floor_sell_value"
                      LIMIT 5
                    )
                    SELECT EXISTS(
                      SELECT FROM "w" WHERE "w"."floor_sell_value" != "w"."value"
                    ) AS "is_wrong"
                  ) "z" ON TRUE
                `
            );
            for (const { id, contract, is_wrong } of results) {
              if (is_wrong) {
                logger.error(
                  "cache-check",
                  `Detected wrong tokens "floor_sell" cache for collection ${id}`
                );

                // Automatically trigger a fix for the wrong cache
                await inject({
                  method: "POST",
                  url: "/admin/fix-cache",
                  headers: {
                    "Content-Type": "application/json",
                    "X-Admin-Api-Key": config.adminApiKey,
                  },
                  payload: {
                    kind: "tokens-floor-sell",
                    contracts: [fromBuffer(contract)],
                  },
                });
              }
            }
          }

          // Randomly check the tokens `top_buy` caches
          {
            const results: {
              id: string;
              contract: Buffer;
              is_wrong: boolean;
            }[] = await redb.manyOrNone(
              `
                  SELECT * FROM (
                    SELECT
                      "c"."id",
                      "c"."contract"
                    FROM "collections" "c"
                    TABLESAMPLE system_rows(5)
                  ) "x"
                  LEFT JOIN LATERAL (
                    WITH "w" AS (
                      SELECT
                        "t"."contract",
                        "t"."token_id",
                        "t"."top_buy_value",
                        "y"."value"
                      FROM "tokens" "t"
                      LEFT JOIN LATERAL (
                        SELECT "o"."value" FROM "orders" "o"
                        JOIN "token_sets_tokens" "tst"
                          ON "o"."token_set_id" = "tst"."token_set_id"
                        WHERE "tst"."contract" = "t"."contract"
                          AND "tst"."token_id" = "t"."token_id"
                          AND "o"."side" = 'buy'
                          AND "o"."fillability_status" = 'fillable'
                          AND "o"."approval_status" = 'approved'
                          AND EXISTS(
                            SELECT FROM "nft_balances" "nb"
                            WHERE "nb"."contract" = "t"."contract"
                              AND "nb"."token_id" = "t"."token_id"
                              AND "nb"."amount" > 0
                              AND "nb"."owner" != "o"."maker"
                          )
                        ORDER BY "o"."value" DESC
                        LIMIT 1
                      ) "y" ON TRUE
                      WHERE "t"."collection_id" = "x"."id"
                      ORDER BY "t"."top_buy_value" desc
                      LIMIT 5
                    )
                    SELECT EXISTS(
                      SELECT FROM "w" WHERE "w"."top_buy_value" != "w"."value"
                    ) AS "is_wrong"
                  ) "z" ON TRUE
                `
            );
            for (const { id, contract, is_wrong } of results) {
              if (is_wrong) {
                logger.error(
                  "cache-check",
                  `Detected wrong tokens "top_buy" cache for collection ${id}`
                );

                // Automatically trigger a fix for the wrong cache
                await inject({
                  method: "POST",
                  url: "/admin/fix-cache",
                  headers: {
                    "Content-Type": "application/json",
                    "X-Admin-Api-Key": config.adminApiKey,
                  },
                  payload: {
                    kind: "tokens-top-buy",
                    contracts: [fromBuffer(contract)],
                  },
                });
              }
            }
          }
        } catch (error) {
          logger.error("cache-check", `Failed to check cache consistency: ${error}`);
        }
      })
  );
}
