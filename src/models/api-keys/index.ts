/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";
import { Request } from "@hapi/hapi";

import { idb, redb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { ApiKeyEntity, ApiKeyUpdateParams } from "@/models/api-keys/api-key-entity";
import getUuidByString from "uuid-by-string";
import { channels } from "@/pubsub/channels";

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
  private static apiKeys: Map<string, ApiKeyEntity> = new Map();

  /**
   * Create a new key, leave the ApiKeyRecord.key empty to generate a new key (uuid) in this function
   *
   * @param values
   */
  public async create(values: ApiKeyRecord): Promise<NewApiKeyResponse | boolean> {
    // Create a new key if none was set
    if (!values.key) {
      values.key = getUuidByString(`${values.key}${values.email}${values.website}`);
    }

    // Create the record in the database
    try {
      await idb.none(
        "INSERT INTO api_keys (${this:name}) values (${this:csv}) ON CONFLICT DO NOTHING",
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
    } catch (e) {
      logger.error("api-key", `Unable to set the redis hash: ${e}`);
      // Let's continue here, even if we can't write to redis, we should be able to check the values against the db
    }

    return {
      key: values.key,
    };
  }

  public static async deleteCachedApiKey(key: string) {
    ApiKeyManager.apiKeys.delete(key); // Delete from local memory cache
    await redis.del(`api-key:${key}`); // Delete from redis cache
  }

  /**
   * When a user passes an api key, we retrieve the details from redis
   * In case the details are not in redis (new redis, api key somehow disappeared from redis) we try to fetch it from
   * the database. In case we couldn't find the key in the database, the key must be wrong. To avoid us doing the
   * lookup constantly in the database, we set a temporary hash key in redis with one value { empty: true }
   *
   * @param key
   */
  public static async getApiKey(key: string): Promise<ApiKeyEntity | null> {
    const cachedApiKey = ApiKeyManager.apiKeys.get(key);
    if (cachedApiKey) {
      return cachedApiKey;
    }

    const redisKey = `api-key:${key}`;

    try {
      const apiKey = await redis.get(redisKey);

      if (apiKey) {
        if (apiKey == "empty") {
          return null;
        } else {
          return new ApiKeyEntity(JSON.parse(apiKey));
        }
      } else {
        // check if it exists in the database
        const fromDb = await redb.oneOrNone(`SELECT * FROM api_keys WHERE key = $/key/`, { key });

        if (fromDb) {
          await redis.set(redisKey, JSON.stringify(fromDb)); // Set in redis
          const apiKey = new ApiKeyEntity(fromDb);
          ApiKeyManager.apiKeys.set(key, apiKey); // Set in local memory storage
          return apiKey;
        } else {
          await redis.set(redisKey, "empty");
          await redis.expire(redisKey, 3600 * 24);
        }
      }
    } catch (error) {
      logger.error("get-api-key", `Failed to get ${key} error: ${error}`);
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
        const apiKey = await ApiKeyManager.getApiKey(key);

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

  public static async update(key: string, fields: ApiKeyUpdateParams) {
    let updateString = "";
    const replacementValues = {
      key,
    };

    _.forEach(fields, (value, fieldName) => {
      updateString += `${_.snakeCase(fieldName)} = $/${fieldName}/,`;
      (replacementValues as any)[fieldName] = value;
    });

    updateString = _.trimEnd(updateString, ",");

    const query = `UPDATE api_keys
                   SET ${updateString}
                   WHERE key = $/key/`;

    await idb.none(query, replacementValues);

    await ApiKeyManager.deleteCachedApiKey(key); // reload the cache
    await redis.publish(channels.apiKeyUpdated, JSON.stringify({ key }));
  }
}
