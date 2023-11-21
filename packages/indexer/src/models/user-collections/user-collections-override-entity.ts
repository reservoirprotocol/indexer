import { fromBuffer } from "@/common/utils";

export type UserCollectionsEntityParams = {
  owner: Buffer;
  collection_id: string;
  contract: Buffer;
  token_count: number;
  floor_sell_value: number;
  total_value: number;
  is_spam: number;
  created_at: string;
  updated_at: string;
};

export class UserCollectionsEntity {
  owner: string;
  collectionId: string;
  contract: string;
  tokenCount: number;
  floorSellValue: number;
  totalValue: number;
  isSpam: number;
  createdAt: string;
  updatedAt: string;

  constructor(params: UserCollectionsEntityParams) {
    this.owner = fromBuffer(params.owner);
    this.collectionId = params.collection_id;
    this.contract = fromBuffer(params.contract);
    this.tokenCount = params.token_count;
    this.floorSellValue = params.floor_sell_value;
    this.totalValue = params.total_value;
    this.isSpam = params.is_spam;
    this.createdAt = params.created_at;
    this.updatedAt = params.updated_at;
  }
}
