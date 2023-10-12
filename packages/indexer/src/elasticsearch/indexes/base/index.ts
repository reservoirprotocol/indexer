import { config } from "@/config/index";
import { getNetworkName } from "@/config/network";
import { Network } from "@reservoir0x/sdk/dist/utils";

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
        id: config.chainId === Network.Ancient8Testnet ? 0 : config.chainId,
        name: getNetworkName(),
      },
      id: data.id,
      indexedAt: new Date(),
      createdAt: new Date(),
    };
  }
}
