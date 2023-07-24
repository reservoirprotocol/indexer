// Define the fields we can update
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
}
