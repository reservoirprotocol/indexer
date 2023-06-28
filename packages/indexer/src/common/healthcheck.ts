import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { hdb } from "@/common/db";
import { log } from "index";

export class HealthCheck {
  static async check(): Promise<boolean> {
    try {
      await hdb.query("SELECT 1");
      log("Postgres Healthcheck successful");
    } catch (error) {
      log(`Postgres Healthcheck failed: ${error}`);
      logger.error("healthcheck", `Postgres Healthcheck failed: ${error}`);
      return false;
    }

    try {
      await redis.ping();
      log("Redis Healthcheck successful");
    } catch (error) {
      log(`Redis Healthcheck failed: ${error}`);
      logger.error("healthcheck", `Redis Healthcheck failed: ${error}`);
      return false;
    }

    return true;
  }
}
