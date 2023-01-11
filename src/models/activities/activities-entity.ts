import { fromBuffer } from "@/common/utils";
import { CollectionsMetadata } from "@/models/collections/collections-entity";

export enum ActivityType {
  sale = "sale",
  ask = "ask",
  transfer = "transfer",
  mint = "mint",
  bid = "bid",
  bid_cancel = "bid_cancel",
  ask_cancel = "ask_cancel",
}

// Define the fields required to create a new activity
export type ActivitiesEntityInsertParams = {
  type: ActivityType;
  hash: string;
  contract: string;
  collectionId: string;
  tokenId: string | null;
  orderId: string | null;
  fromAddress: string;
  toAddress: string | null;
  price: number;
  amount: number;
  blockHash: string | null;
  eventTimestamp: number;
  metadata?: ActivityMetadata;
};

// Define the fields need to instantiate the entity
export type ActivitiesEntityParams = {
  id: number;
  hash: string;
  type: ActivityType;
  contract: Buffer;
  collection_id: string;
  token_id: string | null;
  order_id: string | null;
  from_address: Buffer;
  to_address: Buffer | null;
  price: number;
  amount: number;
  block_hash: Buffer | null;
  event_timestamp: number;
  created_at: Date;
  metadata: ActivityMetadata;
  token_name: string;
  token_image: string;
  collection_name: string;
  collection_metadata: CollectionsMetadata;
  order_side: string;
  order_source_id_int: number;
  order_kind: string;
  order_metadata: Record<string, unknown>;
  order_criteria: Record<string, unknown>;
};

// Possible fields to be found in the metadata
export type ActivityMetadata = {
  transactionHash?: string;
  logIndex?: number;
  batchIndex?: number;
  orderId?: string;
  orderSide?: string;
  orderSourceIdInt?: number;
  orderKind?: string;
  orderMetadata?: Record<string, unknown>;
  orderCriteria?: Record<string, unknown>;
};

export type ActivityToken = {
  tokenId: string | null;
  tokenName?: string;
  tokenImage?: string;
};

export type ActivityCollection = {
  collectionId: string | null;
  collectionName?: string;
  collectionImage?: string;
};

export type ActivityOrder = {
  id: string | null;
  side: string | null;
  sourceIdInt: number | null;
  kind: string | null;
  metadata: Record<string, unknown> | null;
  criteria: Record<string, unknown> | null;
};

export class ActivitiesEntity {
  id: number;
  hash: string;
  type: ActivityType;
  contract: string;
  collectionId: string;
  tokenId: string | null;
  orderId: string | null;
  fromAddress: string;
  toAddress: string | null;
  price: number;
  amount: number;
  blockHash: string | null;
  eventTimestamp: number;
  createdAt: Date;
  metadata: ActivityMetadata;
  token?: ActivityToken;
  collection?: ActivityCollection;
  order?: ActivityOrder;

  constructor(params: ActivitiesEntityParams) {
    this.id = params.id;
    this.hash = params.hash;
    this.type = params.type;
    this.contract = fromBuffer(params.contract);
    this.collectionId = params.collection_id;
    this.tokenId = params.token_id;
    this.orderId = params.order_id;
    this.fromAddress = fromBuffer(params.from_address);
    this.toAddress = params.to_address ? fromBuffer(params.to_address) : null;
    this.price = params.price;
    this.amount = Number(params.amount);
    this.blockHash = params.block_hash ? fromBuffer(params.block_hash) : null;
    this.eventTimestamp = params.event_timestamp;
    this.createdAt = params.created_at;
    this.metadata = params.metadata;
    this.token = {
      tokenId: params.token_id,
      tokenImage: params.token_image,
      tokenName: params.token_name,
    };
    this.collection = {
      collectionId: params.collection_id,
      collectionImage: params.collection_metadata?.imageUrl,
      collectionName: params.collection_name,
    };
    this.order = {
      id: params.order_id,
      side: params.order_side,
      sourceIdInt: params.order_source_id_int,
      kind: params.order_kind,
      metadata: params.order_metadata,
      criteria: params.order_criteria,
    };
  }
}
