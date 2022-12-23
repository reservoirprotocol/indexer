/* eslint-disable @typescript-eslint/no-explicit-any */
import _ from "lodash";

import { rateLimitRedis, redis } from "@/common/redis";
import { idb, redb } from "@/common/db";
import {
  RateLimitRuleEntity,
  RateLimitRuleEntityParams,
  RateLimitRuleOptions,
  RateLimitRuleUpdateParams,
} from "@/models/rate-limit-rules/rate-limit-rule-entity";
import { channels } from "@/pubsub/channels";
import { logger } from "@/common/logger";
import { ApiKeyManager } from "@/models/api-keys";
import { RateLimiterRedis } from "rate-limiter-flexible";

export class RateLimitRules {
  private static instance: RateLimitRules;

  public rulesEntities: Map<string, RateLimitRuleEntity>;
  public rules: Map<string, RateLimiterRedis>;

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private constructor() {
    this.rulesEntities = new Map();
    this.rules = new Map();
  }

  private async loadData(forceDbLoad = false) {
    // Try to load from cache
    const rulesCache = await redis.get(RateLimitRules.getCacheKey());
    let rules: RateLimitRuleEntityParams[] = [];

    if (_.isNull(rulesCache) || forceDbLoad) {
      // If no cache load from DB
      try {
        rules = await redb.manyOrNone(`SELECT * FROM rate_limit_rules`);
      } catch (error) {
        logger.error("rate-limit-rules", "Failed to load rate limit rules");
      }

      await redis.set(RateLimitRules.getCacheKey(), JSON.stringify(rules), "EX", 60 * 60 * 24);
    } else {
      // Parse the cache data
      rules = JSON.parse(rulesCache);
    }

    const newRulesMetadata = new Map(); // Reset current rules
    const newRules = new Map(); // Reset current rules

    for (const rule of rules) {
      const rateLimitRule = new RateLimitRuleEntity(rule);

      newRulesMetadata.set(
        RateLimitRules.getRuleKey(
          rateLimitRule.route,
          rateLimitRule.method,
          rateLimitRule.tier,
          rateLimitRule.apiKey
        ),
        rateLimitRule
      );

      newRules.set(
        RateLimitRules.getRuleKey(
          rateLimitRule.route,
          rateLimitRule.method,
          rateLimitRule.tier,
          rateLimitRule.apiKey
        ),
        new RateLimiterRedis({
          storeClient: rateLimitRedis,
          points: rateLimitRule.options.points,
          duration: rateLimitRule.options.duration,
          inMemoryBlockOnConsumed: rateLimitRule.options.points,
        })
      );
    }

    this.rulesEntities = newRulesMetadata;
    this.rules = newRules;
  }

  public static getRuleKey(route: string, method: string, tier: number | null, apiKey: string) {
    return `${route}:${method}:${_.isNull(tier) ? "" : tier}:${apiKey}`;
  }

  public static getDefaultRuleKeyForTier(tier: number) {
    return RateLimitRules.getRuleKey("/", "", tier, "");
  }

  public static getCacheKey() {
    return "rate-limit-rules";
  }

  public static async forceDataReload() {
    if (RateLimitRules.instance) {
      await RateLimitRules.instance.loadData(true);
    }
  }

  public static async getInstance() {
    if (!this.instance) {
      this.instance = new RateLimitRules();
      await this.instance.loadData();
    }

    return this.instance;
  }

  public static async create(
    route: string,
    apiKey: string,
    method: string,
    tier: number | null,
    options: RateLimitRuleOptions
  ) {
    const query = `INSERT INTO rate_limit_rules (route, api_key, method, tier, options)
                   VALUES ($/route/, $/apiKey/, $/method/, $/tier/, $/options:json/)
                   RETURNING *`;

    const values = {
      route,
      apiKey,
      method,
      tier,
      options,
    };

    const rateLimitRule = await idb.oneOrNone(query, values);
    const rateLimitRuleEntity = new RateLimitRuleEntity(rateLimitRule);

    await RateLimitRules.forceDataReload(); // reload the cache
    await redis.publish(
      channels.rateLimitRuleUpdated,
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
        updateString += `${_.snakeCase(fieldName)} = $/${fieldName}/,`;
        (replacementValues as any)[fieldName] = param;
      }
    });

    updateString = _.trimEnd(updateString, ",");

    const query = `UPDATE rate_limit_rules
                   SET ${updateString}
                   WHERE id = $/id/`;

    await idb.none(query, replacementValues);
    await redis.publish(channels.rateLimitRuleUpdated, `Updated rule id ${id}`);
  }

  public static async delete(id: number) {
    const query = `DELETE FROM rate_limit_rules
                   WHERE id = $/id/`;

    const values = {
      id,
    };

    await idb.none(query, values);
    await RateLimitRules.forceDataReload(); // reload the cache
    await redis.publish(channels.rateLimitRuleUpdated, `Deleted rule id ${id}`);
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

  public getRule(route: string, method: string, tier: number, apiKey = "") {
    let rule: RateLimiterRedis | undefined;

    // Check for api key specific rule on the route method
    rule = this.rules.get(RateLimitRules.getRuleKey(route, method, null, apiKey));
    if (rule) {
      rule.keyPrefix = route;
      return rule;
    }

    // Check for api key specific rule on the route
    rule = this.rules.get(RateLimitRules.getRuleKey(route, "", null, apiKey));
    if (rule) {
      rule.keyPrefix = route;
      return rule;
    }

    // Check for route method rule for the given tier
    rule = this.rules.get(RateLimitRules.getRuleKey(route, method, tier, ""));
    if (rule) {
      rule.keyPrefix = route;
      return rule;
    }

    // Check for route method rule for all tiers
    rule = this.rules.get(RateLimitRules.getRuleKey(route, method, null, ""));
    if (rule) {
      rule.keyPrefix = route;
      return rule;
    }

    // Check for route all methods rule
    rule = this.rules.get(RateLimitRules.getRuleKey(route, "", tier, ""));
    if (rule) {
      rule.keyPrefix = route;
      return rule;
    }

    // Check for route all methods rule all tiers
    rule = this.rules.get(RateLimitRules.getRuleKey(route, "", null, ""));
    if (rule) {
      rule.keyPrefix = route;
      return rule;
    }

    rule = this.rules.get(RateLimitRules.getDefaultRuleKeyForTier(tier));
    if (rule) {
      return rule;
    }

    return null;
  }

  public getAllRules() {
    return RateLimitRules.instance.rulesEntities;
  }
}
