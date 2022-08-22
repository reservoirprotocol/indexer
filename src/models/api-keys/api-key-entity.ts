// Define the fields we can update
export type ApiKeyUpdateParams = {
  website?: string;
};

export type ApiKeyEntityParams = {
  key: string;
  app_name: string;
  website: string;
  email: string;
  created_at: string;
  active: boolean;
};

export class ApiKeyEntity {
  key: string;
  appName: string;
  website: string;
  email: string;
  createdAt: string;
  active: boolean;

  constructor(params: ApiKeyEntityParams) {
    this.key = params.key;
    this.appName = params.app_name;
    this.website = params.website;
    this.email = params.email;
    this.createdAt = params.created_at;
    this.active = Boolean(params.active);
  }
}
