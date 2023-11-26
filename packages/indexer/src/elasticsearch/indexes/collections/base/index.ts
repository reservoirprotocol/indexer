/* eslint-disable @typescript-eslint/no-explicit-any */

import { formatEth, fromBuffer } from "@/common/utils";

import { BuildDocumentData, BaseDocument, DocumentBuilder } from "@/elasticsearch/indexes/base";
import { config } from "@/config/index";
import { getNetworkName } from "@/config/network";

export interface CollectionDocument extends BaseDocument {
  id: string;
  contract: string;
  name: string;
  slug: string;
  image: string;
  community: string;
  tokenCount: number;
  metadataDisabled: boolean;
  isSpam: boolean;
  nameSuggest: any;
  nameSuggestV2: any;
  allTimeVolumeDecimal?: number;
  floorSell?: {
    id?: string;
    value?: string;
    currency?: string;
    currencyPrice?: string;
  };
}

export interface BuildCollectionDocumentData extends BuildDocumentData {
  id: string;
  contract: Buffer;
  name: string;
  slug: string;
  image: string;
  created_at: Date;
  community: string;
  token_count: number;
  metadata_disabled: number;
  is_spam: number;
  all_time_volume: string;
  floor_sell_id?: string;
  floor_sell_value?: string;
  floor_sell_currency?: Buffer;
  floor_sell_currency_price?: string;
}

export class CollectionDocumentBuilder extends DocumentBuilder {
  public buildDocument(data: BuildCollectionDocumentData): CollectionDocument {
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
      metadataDisabled: Number(data.metadata_disabled) > 0,
      isSpam: Number(data.is_spam) > 0,
      allTimeVolumeDecimal: formatEth(data.all_time_volume),
      floorSell: data.floor_sell_id
        ? {
            id: data.floor_sell_id,
            value: data.floor_sell_value,
            currency: data.floor_sell_currency ? fromBuffer(data.floor_sell_currency) : undefined,
            currencyPrice: data.floor_sell_currency_price,
          }
        : undefined,
      // nameSuggest: {
      //   input: this.generateInputValues(data),
      //   weight: this.formatAllTimeVolume(data),
      //   contexts: {
      //     chainId: [config.chainId],
      //     id: [data.id],
      //     community: data.community ? [data.community] : [],
      //     hasTokens: [Number(data.token_count) > 0],
      //     isSpam: [Number(data.is_spam) > 0],
      //   },
      // },
      nameSuggestV2: data.name,
    } as CollectionDocument;

    return document;
  }

  formatAllTimeVolume(data: BuildCollectionDocumentData) {
    const allTimeVolume = 0;

    if (data.all_time_volume) {
      // allTimeVolume = formatEth(data.all_time_volume);
    }

    // allTimeVolume = Math.trunc(allTimeVolume * 100000);
    //
    // if (allTimeVolume > 0) {
    //   const normalizedAllTimeVolume = Math.ceil(allTimeVolume / 2147483647);
    //
    //   logger.info(
    //     "elasticsearch-collections",
    //     JSON.stringify({
    //       topic: "debugCollectionsIndex",
    //       message: `Document with volume. collectionId=${data.id}, allTimeVolume=${allTimeVolume}, normalizedAllTimeVolume=${normalizedAllTimeVolume}`,
    //       data,
    //       allTimeVolume,
    //       normalizedAllTimeVolume,
    //     })
    //   );
    //
    //   allTimeVolume = normalizedAllTimeVolume;
    // }

    return allTimeVolume;
  }

  generateInputValues(data: BuildCollectionDocumentData): string[] {
    const words = data.name.split(" ");
    const combinations: string[] = [];

    for (let i = 0; i < words.length; i++) {
      const combination = words.slice(i).join(" ");
      combinations.push(combination);
    }

    return combinations;
  }
}
