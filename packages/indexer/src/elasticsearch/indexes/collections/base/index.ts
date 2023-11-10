/* eslint-disable @typescript-eslint/no-explicit-any */

import { fromBuffer } from "@/common/utils";

import { BuildDocumentData, BaseDocument, DocumentBuilder } from "@/elasticsearch/indexes/base";
import { config } from "@/config/index";
import { getNetworkName } from "@/config/network";
import { formatEther } from "@ethersproject/units";

export interface CollectionDocument extends BaseDocument {
  id: string;
  contract: string;
  name: string;
  slug: string;
  image: string;
  community: string;
  tokenCount: number;
  isSpam: boolean;
  nameSuggest: any;
}

export interface BuildCollectionDocumentDocumentData extends BuildDocumentData {
  id: string;
  contract: Buffer;
  name: string;
  slug: string;
  image: string;
  created_at: Date;
  community: string;
  token_count: number;
  is_spam: number;
  all_time_volume: number;
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
      slug: data.slug,
      image: data.image,
      community: data.community,
      tokenCount: Number(data.token_count),
      isSpam: Number(data.is_spam) > 0,
      nameSuggest: {
        input: [data.name],
        weight: data.all_time_volume
          ? Number(Number(formatEther(data.all_time_volume)).toFixed(18))
          : 0,
        contexts: {
          chainId: [config.chainId],
          id: [data.id],
          community: data.community ? [data.community] : [],
          hasTokens: [Number(data.token_count) > 0],
          isSpam: [Number(data.is_spam) > 0],
        },
      },
    } as CollectionDocument;
  }
}
