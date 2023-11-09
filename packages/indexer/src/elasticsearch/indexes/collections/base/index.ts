/* eslint-disable @typescript-eslint/no-explicit-any */

import { fromBuffer } from "@/common/utils";

import { BuildDocumentData, BaseDocument, DocumentBuilder } from "@/elasticsearch/indexes/base";
import { config } from "@/config/index";
import { getNetworkName } from "@/config/network";

export interface CollectionDocument extends BaseDocument {
  id: string;
  contract: string;
  name: string;
  community: string;
  tokenCount: number;
}

export interface BuildCollectionDocumentDocumentData extends BuildDocumentData {
  id: string;
  contract: Buffer;
  name: string;
  created_at: Date;
  community: string;
  token_count: number;
}

export class CollectionDocumentBuilder extends DocumentBuilder {
  public buildDocument(data: BuildCollectionDocumentDocumentData): CollectionDocument {
    const baseDocument = super.buildDocument(data);

    return {
      ...baseDocument,
      chain: {
        id: config.chainId,
        name: getNetworkName(),
      },
      createdAt: data.created_at,
      contract: fromBuffer(data.contract),
      name: data.name,
      community: data.community,
      tokenCount: Number(data.token_count),
    } as CollectionDocument;
  }
}
