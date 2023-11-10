/* eslint-disable @typescript-eslint/no-explicit-any */

import { formatEth, fromBuffer } from "@/common/utils";

import { BuildDocumentData, BaseDocument, DocumentBuilder } from "@/elasticsearch/indexes/base";
import { config } from "@/config/index";
import { getNetworkName } from "@/config/network";
import { logger } from "@/common/logger";

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
  all_time_volume: string;
}

export class CollectionDocumentBuilder extends DocumentBuilder {
  public buildDocument(data: BuildCollectionDocumentDocumentData): CollectionDocument {
    const baseDocument = super.buildDocument(data);

    const document = {
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
        weight: this.formatAllTimeVolume(data),
        contexts: {
          chainId: [config.chainId],
          id: [data.id],
          community: data.community ? [data.community] : [],
          hasTokens: [Number(data.token_count) > 0],
          isSpam: [Number(data.is_spam) > 0],
        },
      },
    } as CollectionDocument;

    logger.info(
      "CollectionDocumentBuilder",
      JSON.stringify({
        topic: "debugCollectionsIndex",
        message: `buildDocument. collectionId=${data.id}`,
        data,
        document,
      })
    );

    return document;
  }

  formatAllTimeVolume(data: BuildCollectionDocumentDocumentData) {
    if (data.all_time_volume) {
      if (data.all_time_volume === "10000000000000000") {
        return 0.01;
      }

      return formatEth(data.all_time_volume);
    }

    return 0;
  }
}
