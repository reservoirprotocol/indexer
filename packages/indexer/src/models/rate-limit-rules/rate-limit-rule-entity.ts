// Define the fields we can update
export type RateLimitRuleUpdateParams = {
  method?: string;
  tier?: number;
  options?: RateLimitRuleOptions;
  apiKey?: string;
};

export type RateLimitRuleOptions = {
  keyPrefix?: string | undefined;
  points?: number | undefined;
  duration?: number | undefined;
};

export type RateLimitRuleEntityParams = {
  id: number;
  route: string;
  method: string;
  tier: number;
  api_key: string;
  options: RateLimitRuleOptions;
  created_at: string;
};

export class RateLimitRuleEntity {
  id: number;
  route: string;
  method: string;
  tier: number;
  apiKey: string;
  options: RateLimitRuleOptions;
  createdAt: string;

  constructor(params: RateLimitRuleEntityParams) {
    this.id = params.id;
    this.route = params.route;
    this.method = params.method;
    this.tier = params.tier;
    this.apiKey = params.api_key;
    this.options = params.options;
    this.createdAt = params.created_at;
  }
}
