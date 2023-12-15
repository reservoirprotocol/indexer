export type SourcesEntityParams = {
  id: number;
  domain: string;
  domainHash: string;
  name: string;
  address: string;
  metadata: SourcesMetadata;
  optimized: boolean;
  createdAt: string;
};

export type SourcesMetadata = {
  adminTitle?: string;
  adminIcon?: string;
  title?: string;
  icon?: string;
  url?: string;
  description?: string;
  twitterUsername?: string;
  socialImage?: string;
  tokenUrlMainnet?: string;
  tokenUrlRinkeby?: string;
  tokenUrlPolygon?: string;
  tokenUrlGoerli?: string;
  tokenUrlArbitrum?: string;
  tokenUrlOptimism?: string;
  tokenUrlBsc?: string;
  tokenUrlZora?: string;
  tokenUrlSepolia?: string;
  tokenUrlMumbai?: string;
  tokenUrlBaseGoerli?: string;
  tokenUrlArbitrumNova?: string;
  tokenUrlAvalanche?: string;
  tokenUrlScrollAlpha?: string;
  tokenUrlZoraTestnet?: string;
  tokenUrlBase?: string;
  tokenUrlZksync?: string;
  tokenUrlPolygonZkevm?: string;
  tokenUrlX1Testnet?: string;
  tokenUrlZkFairTestnet?: string;
};

export class SourcesEntity {
  id: number;
  name: string;
  domain: string;
  domainHash: string;
  address: string;
  metadata: SourcesMetadata;
  optimized: boolean;
  createdAt: string;

  constructor(params: SourcesEntityParams) {
    this.id = params.id;
    this.name = params.name;
    this.domain = params.domain;
    this.domainHash = params.domainHash;
    this.address = params.address;
    this.metadata = params.metadata;
    this.optimized = params.optimized;
    this.createdAt = params.createdAt;
  }

  getIcon() {
    return this.metadata.adminIcon || this.metadata.icon;
  }

  getTitle() {
    return this.metadata.adminTitle || this.metadata.title || this.name;
  }
}
