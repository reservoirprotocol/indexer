export enum ApiKeyPermission {
  override_collection_refresh_cool_down = "override_collection_refresh_cool_down",
  assign_collection_to_community = "assign_collection_to_community",
}

// Define the fields we can update
export type ApiKeyUpdateParams = {
  website?: string;
  tier?: number;
  active?: boolean;
  ips?: string[];
  origins?: string[];
};

export type ApiKeyEntityParams = {
  key: string;
  app_name: string;
  website: string;
  email: string;
  created_at: string;
  active: boolean;
  tier: number;
  permissions: Record<string, unknown>;
  ips: string[];
  origins: string[];
};

export class ApiKeyEntity {
  key: string;
  appName: string;
  website: string;
  email: string;
  createdAt: string;
  active: boolean;
  tier: number;
  permissions: Record<ApiKeyPermission, unknown>;
  ips: string[];
  origins: string[];

  constructor(params: ApiKeyEntityParams) {
    this.key = params.key;
    this.appName = params.app_name;
    this.website = params.website;
    this.email = params.email;
    this.createdAt = params.created_at;
    this.active = Boolean(params.active);
    this.tier = Number(params.tier);
    this.permissions = params.permissions;
    this.ips = params.ips;
    this.origins = params.origins;
  }
}
