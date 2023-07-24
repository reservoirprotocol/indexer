/* eslint-disable no-console */

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { hdb } from "@/common/db";

export class HealthCheck {
  static async check(): Promise<boolean> {
    console.log("health check - start");

    try {
      await hdb.query("SELECT 1");

      console.log("health check - db ok");
    } catch (error) {
      logger.error("healthcheck", `Postgres Healthcheck failed: ${error}`);
      return false;
    }

    try {
      await redis.ping();

      console.log("health check - redis ok");
    } catch (error) {
      logger.error("healthcheck", `Redis Healthcheck failed: ${error}`);
      return false;
    }

    console.log("health check - ok");

    return true;
  }
}
