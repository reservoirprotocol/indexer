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
  nameSuggest: any;
  nameSuggestV2: any;
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
      nameSuggest: {
        input: [data.name],
        contexts: {
          chainId: [config.chainId],
          community: data.community ? [data.community] : [],
          hasTokens: [Number(data.token_count) > 0 ? "true" : "false"],
        },
      },
      nameSuggestV2: {
        input: [data.name],
        contexts: {
          chainId: [config.chainId],
          id: [data.id],
          community: data.community ? [data.community] : [],
          hasTokens: [Number(data.token_count) > 0 ? "true" : "false"],
        },
      },
    } as CollectionDocument;
  }
}
