import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";

export class HealthCheck {
  static async check(): Promise<boolean> {
    try {
      await Promise.all([redb.query("SELECT 1"), redis.ping()]);
    } catch (error) {
      logger.error("healthcheck", `Healthcheck failed: ${error}`);
      return false;
    }

    return true;
  }
}
