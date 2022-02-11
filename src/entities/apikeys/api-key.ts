import { db } from "@/common/db";
import { redis } from "@/common/redis";
import { v4 as uuidv4 } from "uuid";
import { logger } from "@/common/logger";
import { Request } from "@hapi/hapi";

export type ApiKeyRecord = {
  name: string;
  website: string;
  email: string;
  key?: string;
};

export type NewApiKeyResponse = {
  key: string;
};

export class ApiKeyManager {
  /**
   * Create a new key, leave the ApiKeyRecord.key empty to generate a new key (uuid) in this function
   *
   * @param values
   */
  public async create(
    values: ApiKeyRecord
  ): Promise<NewApiKeyResponse | boolean> {
    // Create a new key if none was set
    if (!values.key) {
      values.key = uuidv4();
    }

    // Create the record in the database
    try {
      await db.none(
        "insert into api_keys (${this:name}) values (${this:csv})",
        values
      );
    } catch (e) {
      logger.error("api-key", `Unable to create a new apikeys record: ${e}`);
      return false;
    }

    // Cache the key on redis for faster lookup
    try {
      const redisKey = `apikey:${values.key}`;
      await redis.hset(redisKey, new Map(Object.entries(values)));
      // await redis.expire(redisKey, 3600);
    } catch (e) {
      logger.error("api-key", `Unable to set the redis hash: ${e}`);
      // Let's continue here, even if we can't write to redis, we should be able to check the values against the db
    }

    return {
      key: values.key,
    };
  }

  /**
   * Log usage of the api key in the logger
   *
   * @param request
   */
  public static async logUsage(request: Request) {
    const key = request.headers["x-api-key"];
    if (key) {
      const redisKey = `apikey:${key}`;

      try {
        const apiKey = await redis.hgetall(redisKey);
        if (apiKey) {
          const log: any = {
            apiKey,
            route: request.route.path,
            method: request.route.method,
          };
          if (request.payload) {
            log.payload = request.payload;
          }

          if (request.params) {
            log.params = request.params;
          }

          if (request.query) {
            log.query = request.query;
          }

          logger.info("metrics", JSON.stringify(log));
        }
      } catch (e) {
        logger.error("api-key", `${e}`);
        // Don't do anything, just continue
      }
    }
  }
}
