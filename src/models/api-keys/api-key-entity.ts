export enum ApiKeyPermission {
  override_collection_refresh_cool_down = "override_collection_refresh_cool_down",
  assign_collection_to_community = "assign_collection_to_community",
}

// Define the fields we can update
export type ApiKeyUpdateParams = {
  website?: string;
  tier?: number;
  active?: boolean;
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

  constructor(params: ApiKeyEntityParams) {
    this.key = params.key;
    this.appName = params.app_name;
    this.website = params.website;
    this.email = params.email;
    this.createdAt = params.created_at;
    this.active = Boolean(params.active);
    this.tier = Number(params.tier);
    this.permissions = params.permissions;
  }
}
