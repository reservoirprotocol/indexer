// Define the fields we can update
export type AttributeKeysEntityParamsUpdateParams = {
  attributeCount?: number;
};

export type AttributeKeysEntityParams = {
  id: number;
  collection_id: string;
  key: string;
  kind: string;
  rank: number;
  attribute_count: number;
};

export class AttributeKeysEntity {
  id: number;
  collectionId: string;
  key: string;
  kind: string;
  rank: number;
  attributeCount: number;

  constructor(params: AttributeKeysEntityParams) {
    this.id = params.id;
    this.collectionId = params.collection_id;
    this.key = params.key;
    this.kind = params.kind;
    this.rank = params.rank;
    this.attributeCount = params.attribute_count;
  }
}
