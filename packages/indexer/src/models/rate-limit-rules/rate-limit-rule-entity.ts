// Define the fields we can update
import _ from "lodash";

export type RateLimitRuleUpdateParams = {
  method?: string;
  tier?: number;
  options?: RateLimitRuleOptions;
  apiKey?: string;
  payload?: RateLimitRulePayload;
};

export type RateLimitRuleOptions = {
  keyPrefix?: string | undefined;
  points?: number | undefined;
  pointsToConsume?: number | undefined;
  duration?: number | undefined;
};

export type RateLimitRulePayload = {
  key: string;
  value: string;
};

export type RateLimitRuleEntityParams = {
  id: number;
  route: string;
  method: string;
  tier: number;
  api_key: string;
  options: RateLimitRuleOptions;
  payload: RateLimitRulePayload[];
  created_at: string;
  correlation_id: string;
};

export class RateLimitRuleEntity {
  id: number;
  route: string;
  method: string;
  tier: number;
  apiKey: string;
  options: RateLimitRuleOptions;
  payload: RateLimitRulePayload[];
  createdAt: string;
  correlationId: string;

  constructor(params: RateLimitRuleEntityParams) {
    this.id = params.id;
    this.route = params.route;
    this.method = params.method;
    this.tier = params.tier;
    this.apiKey = params.api_key;
    this.options = params.options;
    this.payload = params.payload;
    this.createdAt = params.created_at;
    this.correlationId = params.correlation_id;
  }

  public static getRateLimitMessage(xApiKey: string, tier: number, maxPoints = 0, duration = 0) {
    switch (tier) {
      case -2:
        return `This request was blocked as you have exceeded your included requests. Please upgrade your plan or contact us at support@reservoir.tools for assistance.`;

      case -1:
        return `This request was blocked as an invalid API key was detected. Please check your key has be set correctly or contact us at support@reservoir.tools for assistance.`;

      case 0:
        if (_.isEmpty(xApiKey)) {
          return `This request was blocked as no API key was detected. Please check your key has be set correctly or contact us at support@reservoir.tools for assistance.`;
        } else {
          return `This request was blocked as an invalid API key was detected. Please check your key has be set correctly or contact us at support@reservoir.tools for assistance.`;
        }

      default:
        return `This request was blocked as you have sent too many requests within the specified time. Max ${maxPoints} requests in ${duration}s.`;
    }
  }
}
