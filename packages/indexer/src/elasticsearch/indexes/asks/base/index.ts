/* eslint-disable @typescript-eslint/no-explicit-any */

import { formatEth, fromBuffer } from "@/common/utils";
import * as Sdk from "@reservoir0x/sdk";
import { config } from "@/config/index";

import { BuildDocumentData, BaseDocument, DocumentBuilder } from "@/elasticsearch/indexes/base";

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
  };
  order: {
    id: string;
    kind: string;
    maker: string;
    taker: string;
    tokenSetId: string;
    sourceId: number;
    quantityFilled: number;
    quantityRemaining: number;
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
  token_attributes?: {
    key: string;
    value: string;
  }[];
  collection_name?: string;
  collection_image?: string;
  collection_is_spam?: number;
  order_id?: string | null;
  order_valid_from: number;
  order_valid_until: number;
  order_quantity_filled: number;
  order_quantity_remaining: number;
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
}

export class AskDocumentBuilder extends DocumentBuilder {
  public buildDocument(data: BuildAskDocumentData): AskDocument {
    const baseDocument = super.buildDocument(data);

    return {
      ...baseDocument,
      createdAt: data.created_at,
      contractAndTokenId: `${fromBuffer(data.contract)}:${data.token_id}`,
      contract: fromBuffer(data.contract),
      token: {
        id: data.token_id,
        name: data.token_name,
        image: data.token_image,
        attributes: data.token_attributes,
        isFlagged: Boolean(data.token_is_flagged || 0),
        rarityRank: data.token_rarity_rank,
        isSpam: Number(data.token_is_spam) > 0,
      },
      collection: data.collection_id
        ? {
            id: data.collection_id,
            name: data.collection_name,
            image: data.collection_image,
            isSpam: Number(data.collection_is_spam) > 0,
          }
        : undefined,
      order: {
        id: data.order_id,
        kind: data.order_kind,
        maker: fromBuffer(data.order_maker),
        taker: data.order_taker ? fromBuffer(data.order_taker) : undefined,
        tokenSetId: data.order_token_set_id,
        validFrom: Number(data.order_valid_from),
        validUntil: Number(data.order_valid_until),
        sourceId: data.order_source_id_int,
        criteria: data.order_criteria,
        quantityFilled: Number(data.order_quantity_filled),
        quantityRemaining: Number(data.order_quantity_remaining),
        pricing: {
          price: String(data.order_pricing_price),
          priceDecimal: formatEth(data.order_pricing_price),
          currencyPrice: data.order_pricing_currency_price
            ? String(data.order_pricing_currency_price)
            : undefined,
          feeBps: data.order_pricing_fee_bps ?? undefined,
          currency: data.order_pricing_currency
            ? fromBuffer(data.order_pricing_currency)
            : Sdk.Common.Addresses.Native[config.chainId],
          value: data.order_pricing_value ? String(data.order_pricing_value) : undefined,
          valueDecimal: data.order_pricing_value ? formatEth(data.order_pricing_value) : undefined,
          currencyValue: data.order_pricing_currency_value
            ? String(data.order_pricing_currency_value)
            : undefined,
          normalizedValue: data.order_pricing_normalized_value
            ? String(data.order_pricing_normalized_value)
            : undefined,
          normalizedValueDecimal: data.order_pricing_normalized_value
            ? formatEth(data.order_pricing_normalized_value)
            : undefined,
          currencyNormalizedValue: data.order_pricing_currency_normalized_value
            ? String(data.order_pricing_currency_normalized_value)
            : undefined,
        },
      },
    } as AskDocument;
  }
}
