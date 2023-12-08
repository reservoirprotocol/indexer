/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  AskDocument,
  AskDocumentBuilder,
  BuildAskDocumentData,
} from "@/elasticsearch/indexes/asks/base";
import { config } from "@/config/index";
import { toBuffer } from "@/common/utils";

export abstract class BaseAskEventHandler {
  public orderId: string;

  constructor(orderId: string) {
    this.orderId = orderId;
  }

  getAskId(): string {
    return `${config.chainId}:${this.orderId}`;
  }

  public buildDocument(data: any): AskDocument {
    const buildAskDocumentData = {
      id: data.id,
      created_at: new Date(data.order_created_at),
      contract: toBuffer(data.contract),
      token_id: data.token_id,
      token_name: data.token_name,
      token_image: data.token_image,
      token_media: data.token_media,
      token_is_flagged: Number(data.token_is_flagged),
      token_is_spam: Number(data.token_is_spam),
      token_rarity_rank: data.token_rarity_rank ? Number(data.token_rarity_rank) : undefined,
      token_attributes: data.token_attributes,
      collection_id: data.collection_id,
      collection_name: data.collection_name,
      collection_image: data.collection_image,
      collection_is_spam: Number(data.collection_is_spam),
      order_id: data.id,
      order_source_id_int: Number(data.order_source_id_int),
      order_criteria: data.order_criteria,
      order_quantity_filled: data.order_quantity_filled,
      order_quantity_remaining: data.order_quantity_remaining,
      order_pricing_currency: data.order_pricing_currency,
      order_pricing_fee_bps: data.order_pricing_fee_bps,
      order_pricing_price: data.order_pricing_price,
      order_pricing_currency_price: data.order_pricing_currency_price,
      order_pricing_value: data.order_pricing_value,
      order_pricing_currency_value: data.order_pricing_currency_value,
      order_pricing_normalized_value: data.order_pricing_normalized_value,
      order_pricing_currency_normalized_value: data.order_pricing_currency_normalized_value,
      order_maker: data.order_maker,
      order_taker: data.order_taker,
      order_token_set_id: data.order_token_set_id,
      order_valid_from: Number(data.order_valid_from),
      order_valid_until: Number(data.order_valid_until),
      order_kind: data.order_kind,
      order_dynamic: data.order_dynamic,
      order_raw_data: data.order_raw_data,
      order_missing_royalties: data.order_missing_royalties,
    } as BuildAskDocumentData;

    return new AskDocumentBuilder().buildDocument(buildAskDocumentData);
  }
}

export interface AskDocumentInfo {
  id: string;
  document: AskDocument;
}
