import { logger } from "@/common/logger";
import { redis } from "@/common/redis";

export class HealthCheck {
  static async check(): Promise<boolean> {
    // try {
    //   await hdb.query("SELECT 1");
    // } catch (error) {
    //   logger.error("healthcheck", `Postgres Healthcheck failed: ${error}`);
    //   return false;
    // }

    try {
      await redis.ping();
    } catch (error) {
      logger.error("healthcheck", `Redis Healthcheck failed: ${error}`);
      return false;
    }

    return true;
  }
}
