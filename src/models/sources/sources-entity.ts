export type SourcesEntityParams = {
  id: number;
  domain: string;
  domainHash: string;
  name: string;
  address: string;
  metadata: SourcesMetadata;
  optimized: boolean;
};

export type SourcesMetadata = {
  adminTitle?: string;
  adminIcon?: string;
  title?: string;
  icon?: string;
  url?: string;
  tokenUrlMainnet?: string;
  tokenUrlRinkeby?: string;
};

export class SourcesEntity {
  id: number;
  name: string;
  domain: string;
  domainHash: string;
  address: string;
  metadata: SourcesMetadata;
  optimized: boolean;

  constructor(params: SourcesEntityParams) {
    this.id = params.id;
    this.name = params.name;
    this.domain = params.domain;
    this.domainHash = params.domainHash;
    this.address = params.address;
    this.metadata = params.metadata;
    this.optimized = params.optimized;
  }

  getIcon() {
    return this.metadata.adminIcon || this.metadata.icon;
  }

  getTitle() {
    return this.metadata.adminTitle || this.metadata.title || this.name;
  }
}
