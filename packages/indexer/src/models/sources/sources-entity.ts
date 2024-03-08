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
  allowedApiKeys?: string[];
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
  tokenUrlArbitrumNova?: string;
  tokenUrlAvalanche?: string;
  tokenUrlBase?: string;
  tokenUrlZksync?: string;
  tokenUrlPolygonZkevm?: string;
  tokenUrlScroll?: string;
  tokenUrlImmutableZkevmTestnet?: string;
  tokenUrlFrameTestnet?: string;
  tokenUrlOpbnb?: string;
  tokenUrlAncient8Testnet?: string;
  tokenUrlAncient8?: string;
  tokenUrlBaseSepolia?: string;
  tokenUrlBlastSepolia?: string;
  tokenUrlApex?: string;
  tokenUrlBlast?: string;
  tokenUrlAstarZkevm?: string;
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
