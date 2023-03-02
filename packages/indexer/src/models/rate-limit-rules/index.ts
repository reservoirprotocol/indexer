/* eslint-disable @typescript-eslint/no-explicit-any */
import _ from "lodash";

import { rateLimitRedis, redis } from "@/common/redis";
import { idb, redb } from "@/common/db";
import {
  RateLimitRuleEntity,
  RateLimitRuleEntityParams,
  RateLimitRuleOptions,
  RateLimitRulePayload,
  RateLimitRuleUpdateParams,
} from "@/models/rate-limit-rules/rate-limit-rule-entity";
import { Channel } from "@/pubsub/channels";
import { logger } from "@/common/logger";
import { ApiKeyManager } from "@/models/api-keys";
import { RateLimiterRedis } from "rate-limiter-flexible";

export class RateLimitRules {
  private static instance: RateLimitRules;

  public rulesEntities: Map<string, RateLimitRuleEntity[]>;
  public rules: Map<number, RateLimiterRedis>;

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private constructor() {
    this.rulesEntities = new Map();
    this.rules = new Map();
  }

  private async loadData(forceDbLoad = false) {
    // Try to load from cache
    const rulesCache = await redis.get(RateLimitRules.getCacheKey());
    let rulesRawData: RateLimitRuleEntityParams[] = [];

    if (_.isNull(rulesCache) || forceDbLoad) {
      // If no cache load from DB
      try {
        const query = `
          SELECT *
          FROM rate_limit_rules
          ORDER BY route DESC, api_key DESC, payload DESC, method DESC, tier DESC
        `;

        rulesRawData = await redb.manyOrNone(query);
      } catch (error) {
        logger.error("rate-limit-rules", "Failed to load rate limit rules");
      }

      await redis.set(
        RateLimitRules.getCacheKey(),
        JSON.stringify(rulesRawData),
        "EX",
        60 * 60 * 24
      );
    } else {
      // Parse the cache data
      rulesRawData = JSON.parse(rulesCache);
    }

    const rulesEntities = new Map<string, RateLimitRuleEntity[]>(); // Reset current rules entities
    const rules = new Map(); // Reset current rules

    for (const rule of rulesRawData) {
      const rateLimitRule = new RateLimitRuleEntity(rule);

      if (rulesEntities.has(rateLimitRule.route)) {
        rulesEntities.get(rateLimitRule.route)?.push(rateLimitRule);
      } else {
        rulesEntities.set(rateLimitRule.route, [rateLimitRule]);
      }

      rules.set(
        rateLimitRule.id,
        new RateLimiterRedis({
          storeClient: rateLimitRedis,
          points: rateLimitRule.options.points,
          duration: rateLimitRule.options.duration,
          inMemoryBlockOnConsumed: rateLimitRule.options.points,
        })
      );
    }

    this.rulesEntities = rulesEntities;
    this.rules = rules;
  }

  public static getCacheKey() {
    return "rate-limit-rules";
  }

  public static async forceDataReload() {
    if (RateLimitRules.instance) {
      await RateLimitRules.instance.loadData(true);
    }
  }

  public static async getInstance(forceDbLoad = false) {
    if (!this.instance) {
      this.instance = new RateLimitRules();
      await this.instance.loadData(forceDbLoad);
    }

    return this.instance;
  }

  public static async create(
    route: string,
    apiKey: string,
    method: string,
    tier: number | null,
    options: RateLimitRuleOptions,
    payload: RateLimitRulePayload[]
  ) {
    const query = `INSERT INTO rate_limit_rules (route, api_key, method, tier, options, payload)
                   VALUES ($/route/, $/apiKey/, $/method/, $/tier/, $/options:json/, $/payload:json/)
                   RETURNING *`;

    const values = {
      route,
      apiKey,
      method,
      tier,
      options,
      payload,
    };

    const rateLimitRule = await idb.oneOrNone(query, values);
    const rateLimitRuleEntity = new RateLimitRuleEntity(rateLimitRule);

    await RateLimitRules.forceDataReload(); // reload the cache
    await redis.publish(
      Channel.RateLimitRuleUpdated,
      `New rate limit rule ${JSON.stringify(rateLimitRuleEntity)}`
    );

    logger.info(
      "rate-limit-rules",
      `New rate limit rule ${JSON.stringify(rateLimitRuleEntity)} was created`
    );

    return rateLimitRuleEntity;
  }

  public static async update(id: number, fields: RateLimitRuleUpdateParams) {
    let updateString = "";
    let jsonBuildObject = "";

    const replacementValues = {
      id,
    };

    _.forEach(fields, (param, fieldName) => {
      if (fieldName === "options") {
        _.forEach(fields.options, (value, key) => {
          if (!_.isUndefined(value)) {
            jsonBuildObject += `'${key}', $/${key}/,`;
            (replacementValues as any)[key] = value;
          }
        });

        jsonBuildObject = _.trimEnd(jsonBuildObject, ",");

        if (jsonBuildObject !== "") {
          updateString += `options = options || jsonb_build_object (${jsonBuildObject}),`;
        }
      } else if (!_.isUndefined(param)) {
        updateString += `${_.snakeCase(fieldName)} = $/${fieldName}${
          _.includes(["payload"], fieldName) ? ":json" : ""
        }/,`;
        (replacementValues as any)[fieldName] = param;
      }
    });

    updateString = _.trimEnd(updateString, ",");

    const query = `UPDATE rate_limit_rules
                   SET ${updateString}
                   WHERE id = $/id/`;

    await idb.none(query, replacementValues);
    await redis.publish(Channel.RateLimitRuleUpdated, `Updated rule id ${id}`);
  }

  public static async delete(id: number) {
    const query = `DELETE FROM rate_limit_rules
                   WHERE id = $/id/`;

    const values = {
      id,
    };

    await idb.none(query, values);
    await RateLimitRules.forceDataReload(); // reload the cache
    await redis.publish(Channel.RateLimitRuleUpdated, `Deleted rule id ${id}`);
  }

  public static async getApiKeyRateLimits(key: string) {
    const apiKey = await ApiKeyManager.getApiKey(key);
    const tier = apiKey?.tier || 0;

    const query = `SELECT DISTINCT ON (route) *
                   FROM rate_limit_rules
                   WHERE (tier = $/tier/ AND api_key IN ('', $/key/))
                   OR (tier IS NULL AND api_key IN ('', $/key/))
                   OR (api_key = $/key/)
                   ORDER BY route, api_key DESC`;

    const values = {
      tier,
      key,
    };

    const rules: RateLimitRuleEntityParams[] = await redb.manyOrNone(query, values);
    return _.map(rules, (rule) => new RateLimitRuleEntity(rule));
  }

  public findMostMatchingRule(
    route: string,
    method: string,
    tier: number,
    apiKey = "",
    payload: Map<string, string> = new Map()
  ) {
    // If there are any rules for the given route
    const rules = this.rulesEntities.get(route);

    if (rules) {
      for (const rule of rules) {
        // Check what criteria to check for the rule
        const verifyApiKey = rule.apiKey !== "";
        const verifyPayload = !_.isEmpty(rule.payload);
        const verifyMethod = rule.method !== "";
        const verifyTier = !_.isNull(rule.tier);

        // Check the rule criteria if any not matching the rule is not matching
        if (verifyApiKey && rule.apiKey !== apiKey) {
          continue;
        }

        if (verifyPayload) {
          let payloadMatching = true;

          // If rule needs payload verification all params need to match
          for (const rulePayload of rule.payload) {
            // If the request consists any of the keys in the request and the value match
            if (
              !payload.has(rulePayload.key) ||
              _.toLower(payload.get(rulePayload.key)) !== _.toLower(rulePayload.value)
            ) {
              payloadMatching = false;
            }
          }

          if (!payloadMatching) {
            continue;
          }
        }

        if (verifyMethod && rule.method !== method) {
          continue;
        }

        if (verifyTier && rule.tier !== tier) {
          continue;
        }

        // If we reached here the rule is matching
        return rule;
      }
    }

    // No matching rule found, return default rules
    const defaultRules = this.rulesEntities.get("/") || [];
    for (const rule of defaultRules) {
      if (rule.tier === tier) {
        return rule;
      }
    }
  }

  public getRateLimitObject(
    route: string,
    method: string,
    tier: number,
    apiKey = "",
    payload: Map<string, string> = new Map()
  ) {
    const rule = this.findMostMatchingRule(route, method, tier, apiKey, payload);

    if (rule) {
      const rateLimitObject = this.rules.get(rule.id);

      if (rateLimitObject) {
        rateLimitObject.keyPrefix = route;
        return rateLimitObject;
      }
    }

    return null;
  }

  public getAllRules() {
    return RateLimitRules.instance.rulesEntities;
  }
}
