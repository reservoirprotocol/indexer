import { config } from "@/config/index";
import { getNetworkName } from "@/config/network";

export interface BaseDocument {
  chain: {
    id: number;
    name: string;
  };
  id: string;
  indexedAt: Date;
  createdAt: Date;
}

export interface BuildDocumentData {
  id: string;
}

export abstract class DocumentBuilder {
  public buildDocument(data: BuildDocumentData): BaseDocument {
    return {
      chain: {
        id: config.chainId,
        name: getNetworkName(),
      },
      id: data.id,
      indexedAt: new Date(),
      createdAt: new Date(),
    };
  }
}
