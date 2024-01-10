import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { hdb } from "@/common/db";
import { config } from "@/config/index";
import { now } from "@/common/utils";
import { getNetworkSettings } from "@/config/network";
import { getLastReceivedEventTimestamp } from "@/websockets/opensea";

export class HealthCheck {
  static async check(): Promise<boolean> {
    try {
      await hdb.query("SELECT 1");
    } catch (error) {
      logger.error("healthcheck", `Postgres Healthcheck failed: ${error}`);
      return false;
    }

    try {
      await redis.ping();
    } catch (error) {
      logger.error("healthcheck", `Redis Healthcheck failed: ${error}`);
      return false;
    }

    if (config.master && getNetworkSettings().enableWebSocket && !getNetworkSettings().isTestnet) {
      const timestamp = await redis.get("latest-block-websocket-received");
      const currentTime = now();
      if (timestamp && Number(timestamp) < currentTime - 60) {
        if (Number(timestamp) < currentTime - 180) {
          logger.error(
            "healthcheck",
            `last realtime websocket received ${timestamp} ${currentTime - Number(timestamp)}s ago`
          );
          return false;
        }

        logger.info(
          "healthcheck",
          `last realtime websocket received ${timestamp} ${currentTime - Number(timestamp)}s ago`
        );
      }
    }

    if (config.doWebsocketWork && config.openSeaApiKey && !getNetworkSettings().isTestnet) {
      const timestamp = getLastReceivedEventTimestamp();
      const currentTime = now();

      if (timestamp && Number(timestamp) < currentTime - 60) {
        if (Number(timestamp) < currentTime - 180) {
          logger.error(
            "healthcheck",
            `last opensea websocket received ${timestamp} ${currentTime - Number(timestamp)}s ago`
          );

          return false;
        }

        logger.info(
          "healthcheck",
          `last opensea websocket received ${timestamp} ${currentTime - Number(timestamp)}s ago`
        );
      }
    }

    return true;
  }
}
