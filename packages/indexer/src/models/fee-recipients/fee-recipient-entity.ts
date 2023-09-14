export type FeeKind = "royalty" | "marketplace";

export type FeeRecipientEntityParams = {
  source_id: number | null;
  address: string;
  kind: FeeKind;
  createdAt: string;
};

export class FeeRecipientEntity {
  sourceId: number | null;
  address: string;
  kind: FeeKind;
  createdAt: string;

  constructor(params: FeeRecipientEntityParams) {
    this.sourceId = params.source_id;
    this.address = params.address;
    this.kind = params.kind;
    this.createdAt = params.createdAt;
  }
}
