/* eslint-disable @typescript-eslint/no-explicit-any */

import { fromBuffer } from "@/common/utils";
import * as Sdk from "@reservoir0x/sdk";
import { config } from "@/config/index";

import { BuildDocumentData, BaseDocument, DocumentBuilder } from "@/elasticsearch/indexes/base";
import { formatEther } from "@ethersproject/units";
import { AddressZero } from "@ethersproject/constants";
import { getNetworkName } from "@/config/network";

export interface AskDocument extends BaseDocument {
  contractAndTokenId: string;
  contract: string;
  token: {
    id: string;
    name: string;
    image: string;
    media?: string;
    isFlagged: boolean;
    isSpam: boolean;
    isNsfw: boolean;
    rarityRank?: number;
    attributes: {
      key: string;
      value: string;
    }[];
  };
  collection?: {
    id: string;
    name: string;
    image: string;
    isSpam: boolean;
  };
  order: {
    id: string;
    kind: string;
    maker: string;
    taker: string;
    tokenSetId: string;
    sourceId: number;
    quantityFilled: string;
    quantityRemaining: string;
    validFrom: number;
    validUntil: number;
    criteria: {
      kind: string;
      data: {
        attribute?: {
          key: string;
          value: string;
        };
        collection?: {
          id: string;
        };
        token?: {
          tokenId: string;
        };
      };
    };
    isDynamic: boolean;
    rawData: Record<string, unknown>;
    missingRoyalties: { bps: number; recipient: string }[];
    pricing: {
      price: string;
      priceDecimal?: number;
      currencyPrice?: string;
      feeBps?: number;
      currency?: string;
      value?: string;
      valueDecimal?: number;
      currencyValue?: string;
      normalizedValue?: string;
      normalizedValueDecimal?: number;
      currencyNormalizedValue?: string;
    };
  };
}

export interface BuildAskDocumentData extends BuildDocumentData {
  id: string;
  created_at: Date;
  contract: Buffer;
  collection_id: string;
  token_id: string;
  amount?: number;
  token_name?: string;
  token_image?: string;
  token_media?: string;
  token_is_flagged?: number;
  token_rarity_rank?: number;
  token_is_spam?: number;
  token_nsfw_status?: number;
  token_attributes?: {
    key: string;
    value: string;
  }[];
  collection_name?: string;
  collection_image?: string;
  collection_is_spam?: number;
  collection_nsfw_status?: number;
  order_id?: string | null;
  order_valid_from: number;
  order_valid_until: number;
  order_quantity_filled: string;
  order_quantity_remaining: string;
  order_source_id_int?: number;
  order_kind: string;
  order_criteria?: {
    kind: string;
    data: Record<string, unknown>;
  };
  order_token_set_id: string;
  order_pricing_price: number;
  order_pricing_currency_price?: number;
  order_pricing_fee_bps?: number;
  order_pricing_currency?: Buffer;
  order_pricing_value?: number;
  order_pricing_currency_value?: number;
  order_pricing_normalized_value?: number;
  order_pricing_currency_normalized_value?: number;
  order_maker: Buffer;
  order_taker?: Buffer;
  order_dynamic: boolean;
  order_raw_data: Record<string, unknown>;
  order_missing_royalties: { bps: number; recipient: string }[];
}

export class AskDocumentBuilder extends DocumentBuilder {
  public buildDocument(data: BuildAskDocumentData): AskDocument {
    const baseDocument = super.buildDocument(data);

    return {
      ...baseDocument,
      chain: {
        id: config.chainId,
        name: getNetworkName(),
      },
      createdAt: data.created_at,
      contractAndTokenId: `${fromBuffer(data.contract)}:${data.token_id}`,
      contract: fromBuffer(data.contract),
      token: {
        id: data.token_id,
        name: data.token_name,
        attributes: data.token_attributes,
        isFlagged: Boolean(data.token_is_flagged || 0),
        rarityRank: data.token_rarity_rank,
        isSpam: Number(data.token_is_spam) > 0,
        isNsfw: Number(data.token_nsfw_status) > 0,
      },
      collection: data.collection_id
        ? {
            id: data.collection_id,
            name: data.collection_name,
            isSpam: Number(data.collection_is_spam) > 0,
            isNsfw: Number(data.collection_nsfw_status) > 0,
          }
        : undefined,
      order: {
        id: data.order_id,
        kind: data.order_kind,
        maker: fromBuffer(data.order_maker),
        taker: data.order_taker ? fromBuffer(data.order_taker) : AddressZero,
        tokenSetId: data.order_token_set_id,
        validFrom: Math.trunc(data.order_valid_from),
        validUntil: Math.trunc(data.order_valid_until),
        sourceId: data.order_source_id_int,
        criteria: data.order_criteria,
        quantityFilled: data.order_quantity_filled,
        quantityRemaining: data.order_quantity_remaining,
        isDynamic: Boolean(data.order_dynamic || 0),
        rawData: data.order_raw_data,
        missingRoyalties: data.order_missing_royalties,
        pricing: {
          price: String(data.order_pricing_price),
          priceDecimal: Number(Number(formatEther(data.order_pricing_price)).toFixed(18)),
          currencyPrice: data.order_pricing_currency_price
            ? String(data.order_pricing_currency_price)
            : undefined,
          feeBps: data.order_pricing_fee_bps ?? undefined,
          currency: data.order_pricing_currency
            ? fromBuffer(data.order_pricing_currency)
            : Sdk.Common.Addresses.Native[config.chainId],
          value: data.order_pricing_value ? String(data.order_pricing_value) : undefined,
          valueDecimal: data.order_pricing_value
            ? Number(Number(formatEther(data.order_pricing_value)).toFixed(18))
            : undefined,
          currencyValue: data.order_pricing_currency_value
            ? String(data.order_pricing_currency_value)
            : undefined,
          normalizedValue: data.order_pricing_normalized_value
            ? String(data.order_pricing_normalized_value)
            : undefined,
          normalizedValueDecimal: data.order_pricing_normalized_value
            ? Number(Number(formatEther(data.order_pricing_normalized_value)).toFixed(18))
            : undefined,
          currencyNormalizedValue: data.order_pricing_currency_normalized_value
            ? String(data.order_pricing_currency_normalized_value)
            : undefined,
        },
      },
    } as AskDocument;
  }
}
