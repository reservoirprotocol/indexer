/* eslint-disable @typescript-eslint/no-explicit-any */

import { formatEth, fromBuffer } from "@/common/utils";
import * as Sdk from "@reservoir0x/sdk";
import { config } from "@/config/index";

import { BuildDocumentData, BaseDocument, DocumentBuilder } from "@/elasticsearch/indexes/base";
import { logger } from "@/common/logger";

export interface TokenListingDocument extends BaseDocument {
  timestamp: number;
  ownership: {
    address: string;
    amount: number;
    acquiredAt: Date;
  };
  token: {
    id: string;
    name: string;
    image: string;
    media: string;
  };
  collection?: {
    id: string;
    name: string;
    image: string;
  };
  order?: {
    id: string;
    sourceId: number;
    quantity: number;
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
      price?: string;
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

export interface BuildTokenListingData extends BuildDocumentData {
  id: string;
  timestamp: number;
  contract: Buffer;
  collection_id: string;
  token_id?: string;
  amount?: number;
  token_name?: string;
  token_image?: string;
  token_media?: string;
  collection_name?: string;
  collection_image?: string;
  ownership_address: Buffer;
  ownership_amount?: number;
  ownership_acquired_at: Date;
  order_id?: string | null;
  order_quantity: number;
  order_source_id_int?: number;
  order_kind?: string;
  order_criteria?: {
    kind: string;
    data: Record<string, unknown>;
  };
  order_pricing_price?: number;
  order_pricing_currency_price?: number;
  order_pricing_fee_bps?: number;
  order_pricing_currency?: Buffer;
  order_pricing_value?: number;
  order_pricing_currency_value?: number;
  order_pricing_normalized_value?: number;
  order_pricing_currency_normalized_value?: number;
}

export class TokenListingBuilder extends DocumentBuilder {
  public buildDocument(data: BuildTokenListingData): TokenListingDocument {
    const baseDocument = super.buildDocument(data);

    logger.info(
      "process-token-listing-event-queue",
      JSON.stringify({
        message: `buildDocument`,
        data,
      })
    );

    return {
      ...baseDocument,
      timestamp: data.timestamp,
      ownership: {
        address: fromBuffer(data.ownership_address),
        amount: data.ownership_amount,
        acquiredAt: data.ownership_acquired_at,
      },
      token: data.token_id
        ? {
            id: data.token_id,
            name: data.token_name,
            image: data.token_image,
          }
        : undefined,
      collection: data.collection_id
        ? {
            id: data.collection_id,
            name: data.collection_name,
            image: data.collection_image,
          }
        : undefined,
      order: data.order_id
        ? {
            id: data.order_id,
            kind: data.order_kind,
            sourceId: data.order_source_id_int,
            criteria: data.order_criteria,
            quantity: data.order_quantity,
            pricing: data.order_pricing_price
              ? {
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
                  valueDecimal: data.order_pricing_value
                    ? formatEth(data.order_pricing_value)
                    : undefined,
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
                }
              : undefined,
          }
        : undefined,
    } as TokenListingDocument;
  }
}
