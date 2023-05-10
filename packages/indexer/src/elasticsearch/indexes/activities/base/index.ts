/* eslint-disable @typescript-eslint/no-explicit-any */

import { fromBuffer } from "@/common/utils";
import * as Sdk from "@reservoir0x/sdk";
import { config } from "@/config/index";

import { BaseBuilder, BaseBuildInfo } from "@/elasticsearch/indexes/base";
import { ActivityDocument, ActivityType } from "@/elasticsearch/indexes/activities";

export interface BuildParams {
  txHash?: string;
  logIndex?: number;
  batchIndex?: number;
  orderId?: string;
}

export interface BuildInfo extends BaseBuildInfo {
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
  token_last_buy_value?: number;
  token_last_sell_value?: number;
  token_last_buy_timestamp?: number;
  token_last_sell_timestamp?: number;
  token_rarity_score?: number;
  token_rarity_rank?: number;
  token_media?: string;
  collection_name?: string;
  collection_image?: string;
  event_block_hash?: Buffer | null;
  event_timestamp?: number;
  event_tx_hash?: Buffer;
  event_log_index?: number;
  event_batch_index?: number;
  order_id?: string | null;
  order_side?: string;
  order_source_id_int?: number;
  order_kind?: string;
  order_criteria?: Record<string, unknown>;
}

export abstract class BaseActivityBuilder extends BaseBuilder {
  abstract getActivityType(buildInfo: BuildInfo): ActivityType;

  abstract getBuildInfo(params: BuildParams): Promise<BuildInfo>;
  public async build(params: BuildParams): Promise<ActivityDocument> {
    const buildInfo = await this.getBuildInfo(params);

    if (!buildInfo) {
      throw new Error("Invalid params.");
    }

    return this.buildDocument(buildInfo);
  }

  public buildDocument(buildInfo: BuildInfo): ActivityDocument {
    const baseDocument = super.buildDocument(buildInfo);

    return {
      ...baseDocument,
      timestamp: buildInfo.timestamp,
      type: this.getActivityType(buildInfo),
      fromAddress: fromBuffer(buildInfo.from),
      toAddress: buildInfo.to ? fromBuffer(buildInfo.to) : undefined,
      amount: buildInfo.amount,
      contract: fromBuffer(buildInfo.contract),
      pricing: buildInfo.pricing_price
        ? {
            price: String(buildInfo.pricing_price),
            currencyPrice: buildInfo.pricing_currency_price
              ? String(buildInfo.pricing_currency_price)
              : undefined,
            usdPrice: buildInfo.pricing_usd_price ?? undefined,
            feeBps: buildInfo.pricing_fee_bps ?? undefined,
            currency: buildInfo.pricing_currency
              ? fromBuffer(buildInfo.pricing_currency)
              : Sdk.Common.Addresses.Eth[config.chainId],
            value: buildInfo.pricing_value ? String(buildInfo.pricing_value) : undefined,
            currencyValue: buildInfo.pricing_currency_value
              ? String(buildInfo.pricing_currency_value)
              : undefined,
            normalizedValue: buildInfo.pricing_normalized_value
              ? String(buildInfo.pricing_normalized_value)
              : undefined,
            currencyNormalizedValue: buildInfo.pricing_currency_normalized_value
              ? String(buildInfo.pricing_currency_normalized_value)
              : undefined,
          }
        : undefined,
      event: buildInfo.event_tx_hash
        ? {
            timestamp: buildInfo.event_timestamp,
            txHash: fromBuffer(buildInfo.event_tx_hash),
            logIndex: buildInfo.event_log_index,
            batchIndex: buildInfo.event_batch_index,
            blockHash: fromBuffer(buildInfo.event_block_hash!),
          }
        : undefined,
      token: buildInfo.token_id
        ? {
            id: buildInfo.token_id,
            name: buildInfo.token_name,
            image: buildInfo.token_image,
          }
        : undefined,
      collection: buildInfo.collection_id
        ? {
            id: buildInfo.collection_id,
            name: buildInfo.collection_name,
            image: buildInfo.collection_image,
          }
        : undefined,
      order: buildInfo.order_id
        ? {
            id: buildInfo.order_id,
            side: buildInfo.order_side,
            sourceId: buildInfo.order_source_id_int,
            criteria: buildInfo.order_criteria,
          }
        : undefined,
    } as ActivityDocument;
  }
}
