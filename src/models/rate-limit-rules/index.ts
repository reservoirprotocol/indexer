/* eslint-disable @typescript-eslint/no-explicit-any */
import _ from "lodash";

import { redis } from "@/common/redis";
import { idb, redb } from "@/common/db";
import {
  RateLimitRuleEntity,
  RateLimitRuleEntityParams,
  RateLimitRuleUpdateParams,
} from "@/models/rate-limit-rules/rate-limit-rule-entity";
import { channels } from "@/pubsub/channels";

export class RateLimitRules {
  private static instance: RateLimitRules;

  public rules: Map<string, RateLimitRuleEntity>;

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private constructor() {
    this.rules = new Map();
  }

  private async loadData(forceDbLoad = false) {
    // Try to load from cache
    const rulesCache = await redis.get(RateLimitRules.getCacheKey());
    let rules: RateLimitRuleEntityParams[];

    if (_.isNull(rulesCache) || forceDbLoad) {
      // If no cache load from DB
      rules = await redb.manyOrNone(`SELECT * FROM rate_limit_rules`);
      await redis.set(RateLimitRules.getCacheKey(), JSON.stringify(rules), "EX", 60 * 60 * 24);
    } else {
      // Parse the cache data
      rules = JSON.parse(rulesCache);
    }

    for (const rule of rules) {
      this.rules.set(
        RateLimitRules.getRuleKey(rule.route, rule.method, rule.tier),
        new RateLimitRuleEntity(rule)
      );
    }
  }

  public static getRuleKey(route: string, method: string, tier: number | null) {
    return `${route}:${method}:${tier}`;
  }

  public static getDefaultRuleKeyForTier(tier: number) {
    return `/::${tier}`;
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
    await redis.publish(channels.rateLimitRuleUpdated, JSON.stringify(`Updated rule id ${id}`));
  }

  public getRule(route: string, method: string, tier: number) {
    let rule: RateLimitRuleEntity | undefined;

    // Check for route method rule for the given tier
    rule = this.rules.get(RateLimitRules.getRuleKey(route, method, tier));
    if (rule) {
      return rule;
    }

    // Check for route method rule for all tiers
    rule = this.rules.get(RateLimitRules.getRuleKey(route, method, null));
    if (rule) {
      return rule;
    }

    // Check for route all methods rule
    rule = this.rules.get(RateLimitRules.getRuleKey(route, "", tier));
    if (rule) {
      return rule;
    }

    // Check for route all methods rule all tiers
    rule = this.rules.get(RateLimitRules.getRuleKey(route, "", null));
    if (rule) {
      return rule;
    }

    return this.rules.get(RateLimitRules.getDefaultRuleKeyForTier(tier));
  }

  public getAllRules() {
    return RateLimitRules.instance.rules;
  }
}
