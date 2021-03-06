/* eslint-disable @typescript-eslint/no-explicit-any */

// TODO: Fix `any` types

import { Request } from "@hapi/hapi";
import { randomUUID } from "crypto";

import { idb, redb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";

export type ApiKeyRecord = {
  app_name: string;
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
  public async create(values: ApiKeyRecord): Promise<NewApiKeyResponse | boolean> {
    // Create a new key if none was set
    if (!values.key) {
      values.key = randomUUID();
    }

    // Create the record in the database
    try {
      await idb.none("insert into api_keys (${this:name}) values (${this:csv})", values);
    } catch (e) {
      logger.error("api-key", `Unable to create a new apikeys record: ${e}`);
      return false;
    }

    // Cache the key on redis for faster lookup
    try {
      const redisKey = `apikey:${values.key}`;
      await redis.hset(redisKey, new Map(Object.entries(values)));
    } catch (e) {
      logger.error("api-key", `Unable to set the redis hash: ${e}`);
      // Let's continue here, even if we can't write to redis, we should be able to check the values against the db
    }

    return {
      key: values.key,
    };
  }

  /**
   * When a user passes an api key, we retrieve the details from redis
   * In case the details are not in redis (new redis, api key somehow disappeared from redis) we try to fetch it from
   * the database. In case we couldn't find the key in the database, the key must be wrong. To avoid us doing the
   * lookup constantly in the database, we set a temporary hash key in redis with one value { empty: true }
   *
   * @param key
   */
  public static async getApiKey(key: string): Promise<null | any> {
    const redisKey = `apikey:${key}`;
    const apiKey: any = await redis.hgetall(redisKey);

    if (apiKey && Object.keys(apiKey).length) {
      if (apiKey.empty) {
        return null;
      } else {
        return apiKey;
      }
    } else {
      // check if it exists in the database
      const fromDb = await redb.oneOrNone(`SELECT * FROM api_keys WHERE key = $/key/`, { key });
      if (fromDb) {
        await redis.hset(redisKey, new Map(Object.entries(fromDb)));
        return fromDb;
      } else {
        const map = new Map();
        map.set("empty", true);
        await redis.hset(redisKey, map);
        await redis.expire(redisKey, 3600 * 24);
      }
    }

    return null;
  }

  /**
   * Log usage of the api key in the logger
   *
   * @param request
   */
  public static async logUsage(request: Request) {
    const key = request.headers["x-api-key"];

    const log: any = {
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

    if (request.headers["x-forwarded-for"]) {
      log.remoteAddress = request.headers["x-forwarded-for"];
    }

    if (request.headers["origin"]) {
      log.origin = request.headers["origin"];
    }

    if (request.info.referrer) {
      log.referrer = request.info.referrer;
    }

    if (request.headers["host"]) {
      log.hostname = request.headers["host"];
    }

    // Add key information if it exists
    if (key) {
      try {
        //  const apiKey = await ApiKeyManager.getApiKey(key);
        const apiKey = null;

        // There is a key, set that key information
        if (apiKey) {
          log.apiKey = apiKey;
        } else {
          // There is a key, but it's null
          log.apiKey = {};
          log.apiKey.app_name = key;
        }
      } catch (e: any) {
        logger.info("api-key", e.message);
      }
    } else {
      // No key, just log No Key as the app name
      log.apiKey = {};
      log.apiKey.app_name = "No Key";
    }

    logger.info("metrics", JSON.stringify(log));
  }
}
