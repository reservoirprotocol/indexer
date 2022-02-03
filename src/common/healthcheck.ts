import { db } from "@/common/db";
import { redis } from "@/common/redis"
import { logger } from "@/common/logger"

export class HealthCheck {
  static async check(): Promise<boolean> {

    try {
      await db.query("SELECT 1")
      await redis.ping();
    } catch (e: any) {
      logger.error('healthcheck', e);
      return false;
    }

    return true;
  }
}
