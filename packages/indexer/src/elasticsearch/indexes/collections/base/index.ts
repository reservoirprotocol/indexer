/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Sdk from "@reservoir0x/sdk";
import { config } from "@/config/index";
import { formatEth, formatUsd, fromBuffer, now } from "@/common/utils";
import { getNetworkName } from "@/config/network";
import { getUSDAndNativePrices } from "@/utils/prices";

import { BuildDocumentData, BaseDocument } from "@/elasticsearch/indexes/base";
// import { logger } from "@/common/logger";

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
    let day1VolumeUsd = 0;
    let day7VolumeUsd = 0;
    let day30VolumeUsd = 0;
    let allTimeVolumeUsd = 0;

    try {
      const prices = await getUSDAndNativePrices(
        Sdk.Common.Addresses.Native[config.chainId],
        data.all_time_volume,
        now(),
        {
          onlyUSD: true,
        }
      );

      allTimeVolumeUsd = formatUsd(prices.usdPrice!);
    } catch {
      // logger.warn(
      //   "cdc-indexer-collections",
      //   JSON.stringify({
      //     topic: "debugActivitiesErrors",
      //     message: `No usd value. collectionId=${data.id}, allTimeVolume=${
      //       data.all_time_volume
      //     }, currencyAddress=${Sdk.Common.Addresses.Native[config.chainId]}`,
      //     error,
      //   })
      // );
    }

    if (data.day1_volume) {
      try {
        const prices = await getUSDAndNativePrices(
          Sdk.Common.Addresses.Native[config.chainId],
          data.day1_volume,
          now(),
          {
            onlyUSD: true,
          }
        );

        day1VolumeUsd = formatUsd(prices.usdPrice!);
      } catch {
        // logger.warn(
        //   "cdc-indexer-collections",
        //   JSON.stringify({
        //     topic: "debugActivitiesErrors",
        //     message: `No usd value. collectionId=${data.id}, allTimeVolume=${
        //       data.all_time_volume
        //     }, currencyAddress=${Sdk.Common.Addresses.Native[config.chainId]}`,
        //     error,
        //   })
        // );
      }
    }

    if (data.day7_volume) {
      try {
        const prices = await getUSDAndNativePrices(
          Sdk.Common.Addresses.Native[config.chainId],
          data.day7_volume,
          now(),
          {
            onlyUSD: true,
          }
        );

        day7VolumeUsd = formatUsd(prices.usdPrice!);
      } catch {
        // logger.warn(
        //   "cdc-indexer-collections",
        //   JSON.stringify({
        //     topic: "debugActivitiesErrors",
        //     message: `No usd value. collectionId=${data.id}, allTimeVolume=${
        //       data.all_time_volume
        //     }, currencyAddress=${Sdk.Common.Addresses.Native[config.chainId]}`,
        //     error,
        //   })
        // );
      }
    }

    if (data.day30_volume) {
      try {
        const prices = await getUSDAndNativePrices(
          Sdk.Common.Addresses.Native[config.chainId],
          data.day30_volume,
          now(),
          {
            onlyUSD: true,
          }
        );

        day30VolumeUsd = formatUsd(prices.usdPrice!);
      } catch {
        // logger.warn(
        //   "cdc-indexer-collections",
        //   JSON.stringify({
        //     topic: "debugActivitiesErrors",
        //     message: `No usd value. collectionId=${data.id}, allTimeVolume=${
        //       data.all_time_volume
        //     }, currencyAddress=${Sdk.Common.Addresses.Native[config.chainId]}`,
        //     error,
        //   })
        // );
      }
    }

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
      suggest: [
        {
          input: data.name,
          weight:
            (data.day1_rank * 0.3 +
              data.day7_rank * 0.2 +
              data.day30_rank * 0.06 +
              data.all_time_rank * 0.04) *
            -10,
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
        {
          input: data.contract_symbol,
          weight:
            (data.day1_rank * 0.3 +
              data.day7_rank * 0.2 +
              data.day30_rank * 0.06 +
              data.all_time_rank * 0.04) *
            -1,
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
      ],
      suggestDay1Rank: [
        {
          input: data.name,
          weight: data.day1_rank ? data.day1_rank * -10 : undefined,
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
        {
          input: data.contract_symbol,
          weight: data.day1_rank ? data.day1_rank * -1 : undefined,
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
      ],
      suggestDay7Rank: [
        {
          input: data.name,
          weight: data.day7_rank ? data.day7_rank * -10 : undefined,
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
        {
          input: data.contract_symbol,
          weight: data.day7_rank ? data.day7_rank * -1 : undefined,
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
      ],
      suggestDay30Rank: [
        {
          input: data.name,
          weight: data.day30_rank ? data.day30_rank * -10 : undefined,
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
        {
          input: data.contract_symbol,
          weight: data.day30_rank ? data.day30_rank * -1 : undefined,
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
      ],
      suggestAllTimeRank: [
        {
          input: data.name,
          weight: data.all_time_rank ? data.all_time_rank * -10 : undefined,
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
        {
          input: data.contract_symbol,
          weight: data.all_time_rank ? data.all_time_rank * -1 : undefined,
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
      ],
      slug: data.slug,
      image: data.image,
      community: data.community,
      tokenCount: Number(data.token_count),
      metadataDisabled: Number(data.metadata_disabled) > 0,
      isSpam: Number(data.is_spam) > 0,
      isNsfw: Number(data.nsfw_status) > 0,
      imageVersion: data.image_version,
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
  }
  // generateInputValues(data: BuildCollectionDocumentData): string[] {
  //   const words = data.name.split(" ");
  //   const combinations: string[] = [];
  //
  //   for (let i = 0; i < words.length; i++) {
  //     const combination = words.slice(i).join(" ");
  //     combinations.push(combination);
  //   }
  //
  //   return combinations;
  // }
}
