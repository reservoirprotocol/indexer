import { Column, Entity, Index } from "typeorm";

@Index(
  "nft_approval_events_address_owner_operator_block_index",
  ["address", "approved", "block", "operator", "owner"],
  {}
)
@Index("nft_approval_events_pk", ["batchIndex", "logIndex", "txHash"], {
  unique: true,
})
@Index("nft_approval_events_block_block_hash_index", ["block", "blockHash"], {})
@Entity("nft_approval_events", { schema: "public" })
export class NftApprovalEvents {
  @Column("bytea", { name: "address" })
  address: Buffer;

  @Column("integer", { name: "block" })
  block: number;

  @Column("bytea", { name: "block_hash" })
  blockHash: Buffer;

  @Column("bytea", { primary: true, name: "tx_hash" })
  txHash: Buffer;

  @Column("integer", { name: "tx_index" })
  txIndex: number;

  @Column("integer", { primary: true, name: "log_index" })
  logIndex: number;

  @Column("integer", { name: "timestamp" })
  timestamp: number;

  @Column("integer", { primary: true, name: "batch_index" })
  batchIndex: number;

  @Column("bytea", { name: "owner" })
  owner: Buffer;

  @Column("bytea", { name: "operator" })
  operator: Buffer;

  @Column("boolean", { name: "approved" })
  approved: boolean;
}
