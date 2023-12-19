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
  imageVersion: number;
  allTimeVolume?: string;
  allTimeVolumeDecimal?: number;
  floorSell?: {
    id?: string;
    value?: string;
    currency?: string;
    currencyPrice?: string;
  };

  openseaVerificationStatus?: string;
}

export interface BuildCollectionDocumentData extends BuildDocumentData {
  id: string;
  contract: Buffer;
  name: string;
  slug: string;
  image: string;
  image_version: number;
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
  opensea_verification_status?: string;
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
      imageVersion: data.image_version,
      allTimeVolume: data.all_time_volume,
      allTimeVolumeDecimal: formatEth(data.all_time_volume),
      floorSell: data.floor_sell_id
        ? {
            id: data.floor_sell_id,
            value: data.floor_sell_value,
            currency: data.floor_sell_currency ? fromBuffer(data.floor_sell_currency) : undefined,
            currencyPrice: data.floor_sell_currency_price,
          }
        : undefined,
      openseaVerificationStatus: data.opensea_verification_status,
    } as CollectionDocument;

    return document;
  }
}
