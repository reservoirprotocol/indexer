/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Sdk from "@reservoir0x/sdk";
import { config } from "@/config/index";
import { formatEth, formatUsd, fromBuffer, now } from "@/common/utils";
import { getNetworkName } from "@/config/network";
import { getUSDAndNativePrices } from "@/utils/prices";

import { BuildDocumentData, BaseDocument } from "@/elasticsearch/indexes/base";
import { logger } from "@/common/logger";

export interface CollectionDocument extends BaseDocument {
  id: string;
  contract: string;
  contractSymbol: string;
  name: string;
  slug: string;
  image: string;
  community: string;
  tokenCount: number;
  metadataDisabled: boolean;
  isSpam: boolean;
  isNsfw: boolean;
  imageVersion: number;
  day1Rank?: number | null;
  day1Volume?: string;
  day1VolumeDecimal?: number | null;
  day1VolumeUsd?: number;
  day7Rank?: number | null;
  day7Volume?: string;
  day7VolumeDecimal?: number | null;
  day7VolumeUsd?: number;
  day30Rank?: number | null;
  day30Volume?: string;
  day30VolumeDecimal?: number | null;
  day30VolumeUsd?: number;
  allTimeRank?: number | null;
  allTimeVolume?: string;
  allTimeVolumeDecimal?: number | null;
  allTimeVolumeUsd?: number;
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
  contract_symbol: string;
  name: string;
  slug: string;
  image: string;
  image_version?: number;
  created_at: Date;
  community: string;
  token_count: number;
  metadata_disabled: number;
  is_spam: number;
  nsfw_status: number;
  day1_rank: number;
  day7_rank: number;
  day30_rank: number;
  all_time_rank: number;
  day1_volume: string;
  day7_volume: string;
  day30_volume: string;
  all_time_volume: string;
  floor_sell_id?: string;
  floor_sell_value?: string;
  floor_sell_currency?: Buffer;
  floor_sell_currency_price?: string;
  opensea_verification_status?: string;
}

export class CollectionDocumentBuilder {
  public async buildDocument(data: BuildCollectionDocumentData): Promise<CollectionDocument> {
    try {
      const day1VolumeUsd = await this.getUsdPrice(data.day1_volume);
      const day7VolumeUsd = await this.getUsdPrice(data.day7_volume);
      const day30VolumeUsd = await this.getUsdPrice(data.day30_volume);
      const allTimeVolumeUsd = await this.getUsdPrice(data.all_time_volume);

      const document = {
        chain: {
          id: config.chainId,
          name: getNetworkName(),
        },
        id: data.id,
        indexedAt: new Date(),
        createdAt: data.created_at,
        contract: fromBuffer(data.contract),
        contractSymbol: data.contract_symbol,
        name: data.name,
        suggest: this.getSuggest(data),
        // suggestDay1Rank: this.getSuggest(data, data.day1_rank),
        // suggestDay7Rank: this.getSuggest(data, data.day7_rank),
        // suggestDay30Rank: this.getSuggest(data, data.day30_rank),
        // suggestAllTimeRank: this.getSuggest(data, data.all_time_rank),
        slug: data.slug,
        image: data.image,
        imageVersion: data.image_version
          ? Math.floor(new Date(data.image_version).getTime() / 1000)
          : undefined,
        community: data.community,
        tokenCount: Number(data.token_count),
        metadataDisabled: Number(data.metadata_disabled) > 0,
        isSpam: Number(data.is_spam) > 0,
        isNsfw: Number(data.nsfw_status) > 0,
        day1Rank: data.day1_rank,
        day1Volume: data.day1_volume,
        day1VolumeDecimal: data.day1_volume ? formatEth(data.day1_volume) : null,
        day1VolumeUsd: day1VolumeUsd,
        day7Rank: data.day7_rank,
        day7Volume: data.day7_volume,
        day7VolumeDecimal: data.day7_volume ? formatEth(data.day7_volume) : null,
        day7VolumeUsd: day7VolumeUsd,
        day30Rank: data.day30_rank,
        day30Volume: data.day30_volume,
        day30VolumeDecimal: data.day7_volume ? formatEth(data.day30_volume) : null,
        day30VolumeUsd: day30VolumeUsd,
        allTimeRank: data.all_time_rank,
        allTimeVolume: data.all_time_volume,
        allTimeVolumeDecimal: data.all_time_volume ? formatEth(data.all_time_volume) : null,
        allTimeVolumeUsd: allTimeVolumeUsd,
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
    } catch (error) {
      logger.error(
        "CollectionDocumentBuilder",
        JSON.stringify({
          message: `buildDocument Error. collectionId=${data.id}, error=${error}`,
          data,
          error,
        })
      );

      throw error;
    }
  }

  async getUsdPrice(price: string): Promise<number> {
    let usdPrice = 0;

    try {
      const prices = await getUSDAndNativePrices(
        Sdk.Common.Addresses.Native[config.chainId],
        price,
        now(),
        {
          onlyUSD: true,
        }
      );

      usdPrice = formatUsd(prices.usdPrice!);
    } catch {
      // SKIP
    }

    return usdPrice;
  }

  getSuggest(data: BuildCollectionDocumentData): any {
    const suggest = [
      {
        input: this.generateInputValues(data),
        weight: Math.floor(
          (data.day1_rank ? 1000000000 - data.day1_rank : 0) * 0.3 +
            (data.day7_rank ? 1000000000 - data.day7_rank : 0) * 0.2 +
            (data.day30_rank ? 1000000000 - data.day30_rank : 0) * 0.06 +
            (data.all_time_rank ? 1000000000 - data.all_time_rank : 0) * 0.04
        ),
        contexts: {
          chainId: [config.chainId],
          id: [data.id],
          community: data.community ? [data.community] : [],
          hasTokens: [Number(data.token_count) > 0],
          isSpam: [Number(data.is_spam) > 0],
          isNsfw: [Number(data.nsfw_status) > 0],
          metadataDisabled: [Number(data.metadata_disabled) > 0],
        },
      },
    ];

    if (data.contract_symbol) {
      suggest.push({
        input: [data.contract_symbol],
        weight: Math.floor(
          (data.day1_rank ? 2000000000 - data.day1_rank : 0) * 0.3 +
            (data.day7_rank ? 2000000000 - data.day7_rank : 0) * 0.2 +
            (data.day30_rank ? 2000000000 - data.day30_rank : 0) * 0.06 +
            (data.all_time_rank ? 2000000000 - data.all_time_rank : 0) * 0.04
        ),
        contexts: {
          chainId: [config.chainId],
          id: [data.id],
          community: data.community ? [data.community] : [],
          hasTokens: [Number(data.token_count) > 0],
          isSpam: [Number(data.is_spam) > 0],
          isNsfw: [Number(data.nsfw_status) > 0],
          metadataDisabled: [Number(data.metadata_disabled) > 0],
        },
      });
    }

    return suggest;
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
