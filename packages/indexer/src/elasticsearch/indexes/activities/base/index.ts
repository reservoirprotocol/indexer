/* eslint-disable @typescript-eslint/no-explicit-any */

import { formatEth, fromBuffer } from "@/common/utils";
import * as Sdk from "@reservoir0x/sdk";
import { config } from "@/config/index";

import { BuildDocumentData, BaseDocument, DocumentBuilder } from "@/elasticsearch/indexes/base";

export enum ActivityType {
  sale = "sale",
  ask = "ask",
  transfer = "transfer",
  mint = "mint",
  bid = "bid",
  bid_cancel = "bid_cancel",
  ask_cancel = "ask_cancel",
}

export interface ActivityDocument extends BaseDocument {
  timestamp: number;
  type: ActivityType;
  contract: string;
  fromAddress: string;
  toAddress: string | null;
  amount: number;
  pricing?: {
    price?: string;
    priceDecimal?: number;
    currencyPrice?: string;
    usdPrice?: number;
    feeBps?: number;
    currency?: string;
    value?: string;
    valueDecimal?: number;
    currencyValue?: string;
    normalizedValue?: string;
    normalizedValueDecimal?: number;
    currencyNormalizedValue?: string;
  };
  event?: {
    timestamp: number;
    txHash: string;
    logIndex: number;
    batchIndex: number;
    blockHash: string;
    fillSourceId?: number;
    washTradingScore: number;
  };
  token?: {
    id: string;
    name: string;
    image: string;
    media: string;
    isSpam: boolean;
  };
  collection?: {
    id: string;
    name: string;
    image: string;
    isSpam: boolean;
  };
  order?: {
    id: string;
    side: string;
    sourceId: number;
    kind: string;
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
  };
}

export interface CollectionAggregation {
  id: string;
  name: string;
  image: string;
  primaryAssetContract: string;
  count: number;
  volume: number;
}

export interface BuildActivityData extends BuildDocumentData {
  id: string;
  type: ActivityType;
  timestamp: number;
  contract: Buffer;
  collection_id: string;
  token_id?: string;
  from: Buffer;
  to?: Buffer;
  pricing_price?: number;
  pricing_currency_price?: Buffer;
  pricing_usd_price: number;
  pricing_fee_bps?: number;
  pricing_currency?: Buffer;
  pricing_value?: number;
  pricing_currency_value?: number;
  pricing_normalized_value?: number;
  pricing_currency_normalized_value?: number;
  amount?: number;
  token_name?: string;
  token_image?: string;
  token_media?: string;
  collection_name?: string;
  collection_image?: string;
  event_block_hash?: Buffer | null;
  event_timestamp?: number;
  event_tx_hash?: Buffer;
  event_log_index?: number;
  event_batch_index?: number;
  event_fill_source_id?: number;
  event_wash_trading_score?: number;
  order_id?: string | null;
  order_side?: string;
  order_source_id_int?: number;
  order_kind?: string;
  collection_is_spam?: number | null;
  token_is_spam?: number | null;
  order_criteria?: {
    kind: string;
    data: Record<string, unknown>;
  };
  created_ts: number;
}

export class ActivityBuilder extends DocumentBuilder {
  public buildDocument(data: BuildActivityData): ActivityDocument {
    const baseActivity = super.buildDocument(data);

    return {
      ...baseActivity,
      timestamp: data.timestamp,
      createdAt: new Date(data.created_ts * 1000),
      type: data.type,
      fromAddress: fromBuffer(data.from),
      toAddress: data.to ? fromBuffer(data.to) : undefined,
      amount: data.amount,
      contract: fromBuffer(data.contract),
      pricing: data.pricing_price
        ? {
            price: String(data.pricing_price),
            priceDecimal: formatEth(data.pricing_price),
            currencyPrice: data.pricing_currency_price
              ? String(data.pricing_currency_price)
              : undefined,
            usdPrice: data.pricing_usd_price ?? undefined,
            feeBps: data.pricing_fee_bps ?? undefined,
            currency: data.pricing_currency
              ? fromBuffer(data.pricing_currency)
              : Sdk.Common.Addresses.Native[config.chainId],
            value: data.pricing_value ? String(data.pricing_value) : undefined,
            valueDecimal: data.pricing_value ? formatEth(data.pricing_value) : undefined,
            currencyValue: data.pricing_currency_value
              ? String(data.pricing_currency_value)
              : undefined,
            normalizedValue: data.pricing_normalized_value
              ? String(data.pricing_normalized_value)
              : undefined,
            normalizedValueDecimal: data.pricing_normalized_value
              ? formatEth(data.pricing_normalized_value)
              : undefined,
            currencyNormalizedValue: data.pricing_currency_normalized_value
              ? String(data.pricing_currency_normalized_value)
              : undefined,
          }
        : undefined,
      event: data.event_tx_hash
        ? {
            timestamp: data.event_timestamp,
            txHash: fromBuffer(data.event_tx_hash),
            logIndex: data.event_log_index,
            batchIndex: data.event_batch_index,
            blockHash: fromBuffer(data.event_block_hash!),
            fillSourceId: data.event_fill_source_id,
            washTradingScore: data.event_wash_trading_score,
          }
        : undefined,
      token: data.token_id
        ? {
            id: data.token_id,
            name: data.token_name,
            image: data.token_image,
            // media: data.token_media,
            isSpam: Number(data.token_is_spam) > 0,
          }
        : undefined,
      collection: data.collection_id
        ? {
            id: data.collection_id,
            name: data.collection_name,
            image: data.collection_image,
            isSpam: Number(data.collection_is_spam) > 0,
          }
        : undefined,
      order: data.order_id
        ? {
            id: data.order_id,
            side: data.order_side,
            sourceId: data.order_source_id_int,
            criteria: data.order_criteria,
          }
        : undefined,
    } as ActivityDocument;
  }
}
