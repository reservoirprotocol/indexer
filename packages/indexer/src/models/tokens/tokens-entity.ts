import { fromBuffer } from "@/common/utils";

// Define the fields we can update
export type TokensEntityUpdateParams = {
  contract?: Buffer;
  tokenId?: string;
  name?: string;
  description?: string;
  image?: string;
  collectionId?: string;
  floorSellId?: string;
  floorSellValue?: number;
  floorSellMaker?: Buffer;
  topBuyId?: string;
  topBuyValue?: number;
  topBuyMaker?: Buffer;
  lastSellTimestamp?: number;
  lastSellValue?: number;
  lastBuyTimestamp?: number;
  lastBuyValue?: number;
  createdAt?: string;
  updatedAt?: string;
  attributes?: Buffer;
  lastMetadataSync?: string;
  isFlagged?: number;
  lastFlagUpdate?: string;
  lastFlagChange?: string;
  supply?: number;
  remainingSupply?: number;
  isSpam?: number;
};

// Define the fields need to instantiate the entity
export type TokensEntityParams = {
  contract: Buffer;
  token_id: string;
  name: string;
  description: string;
  image: string;
  collection_id: string;
  floor_sell_id: string;
  floor_sell_value: number;
  floor_sell_maker: Buffer;
  top_buy_id: string;
  top_buy_value: number;
  top_buy_maker: Buffer;
  last_sell_timestamp: number;
  last_sell_value: number;
  last_buy_timestamp: number;
  last_buy_value: number;
  created_at: string;
  updated_at: string;
  attributes: Buffer;
  last_metadata_sync: string;
  is_flagged: number;
  last_flag_update: string;
  last_flag_change: string;
  rarity_score: number;
  rarity_rank: number;
  media: string;
  supply: number | null;
  remaining_supply: number | null;
  is_spam: number | null;
};

export class TokensEntity {
  contract: string;
  tokenId: string;
  name: string;
  description: string;
  image: string;
  collectionId: string;
  floorSellId: string;
  floorSellValue: number;
  floorSellMaker: string;
  topBuyId: string;
  topBuyValue: number;
  topBuyMaker: string;
  lastSellTimestamp: number;
  lastSellValue: number;
  lastBuyTimestamp: number;
  lastBuyValue: number;
  createdAt: string;
  updatedAt: string;
  attributes: string;
  lastMetadataSync: string;
  isFlagged: number;
  lastFlagUpdate: string;
  lastFlagChange: string;
  rarityScore: number;
  rarityRank: number;
  media: string;
  supply: number;
  remainingSupply: number;
  isSpam: number;

  constructor(params: TokensEntityParams) {
    this.contract = fromBuffer(params.contract);
    this.tokenId = params.token_id;
    this.name = params.name;
    this.description = params.description;
    this.image = params.image;
    this.collectionId = params.collection_id;
    this.floorSellId = params.floor_sell_id;
    this.floorSellValue = params.floor_sell_value;
    this.floorSellMaker = params.floor_sell_maker
      ? fromBuffer(params.floor_sell_maker)
      : params.floor_sell_maker;
    this.topBuyId = params.top_buy_id;
    this.topBuyValue = params.top_buy_value;
    this.topBuyMaker = params.top_buy_maker
      ? fromBuffer(params.top_buy_maker)
      : params.top_buy_maker;
    this.lastSellTimestamp = params.last_sell_timestamp;
    this.lastSellValue = params.last_sell_value;
    this.lastBuyTimestamp = params.last_buy_timestamp;
    this.lastBuyValue = params.last_buy_value;
    this.createdAt = params.created_at;
    this.updatedAt = params.updated_at;
    this.attributes = params.attributes ? fromBuffer(params.attributes) : params.attributes;
    this.lastMetadataSync = params.last_metadata_sync;
    this.isFlagged = Number(params.is_flagged);
    this.lastFlagUpdate = params.last_flag_update;
    this.lastFlagChange = params.last_flag_change;
    this.rarityScore = params.rarity_score;
    this.rarityRank = params.rarity_rank;
    this.media = params.media;
    this.supply = Number(params.supply);
    this.remainingSupply = Number(params.remaining_supply);
    this.isSpam = Number(params.is_spam);
  }
}
