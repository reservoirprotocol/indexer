import { config } from "@/config/index";
import { getNetworkName } from "@/config/network";

export interface BaseDocument {
  chain: {
    id: number;
    name: string;
  };
  id: string;
  createdAt: Date;
}

export interface BaseBuildInfo {}

export abstract class BaseBuilder {
  abstract getId(buildInfo: BaseBuildInfo): string;

  public buildDocument(buildInfo: BaseBuildInfo): BaseDocument {
    return {
      chain: {
        id: config.chainId,
        name: getNetworkName(),
      },
      id: this.getId(buildInfo),
      createdAt: new Date(),
    };
  }
}
