import { Column, Entity, Index } from "typeorm";

@Index(
  "nft_transfer_events_address_token_id_timestamp_index",
  ["address", "timestamp", "tokenId"],
  {}
)
@Index(
  "nft_transfer_events_updated_at_address_token_id_index",
  ["address", "tokenId", "updatedAt"],
  {}
)
@Index(
  "nft_transfer_events_address_is_deleted_timestamp_index",
  ["address", "isDeleted", "timestamp"],
  {}
)
@Index(
  "nft_transfer_events_address_is_deleted_updated_at_index",
  ["address", "isDeleted", "updatedAt"],
  {}
)
@Index("nft_transfer_events_pk", ["batchIndex", "blockHash", "logIndex", "txHash"], {
  unique: true,
})
@Index("nft_transfer_events_block_block_hash_index", ["block", "blockHash"], {})
@Index("nft_transfer_events_timestamp_index", ["timestamp"], {})
@Entity("nft_transfer_events")
export class NftTransferEvents {
  @Column("bytea", { name: "address" })
  address: Buffer;

  @Column("integer", { name: "block" })
  block: number;

  @Column("bytea", { primary: true, name: "block_hash" })
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

  @Column("bytea", { name: "from" })
  from: Buffer;

  @Column("bytea", { name: "to" })
  to: Buffer;

  @Column("numeric", { name: "token_id", precision: 78, scale: 0 })
  tokenId: string;

  @Column("numeric", { name: "amount", precision: 78, scale: 0 })
  amount: string;

  @Column("timestamp with time zone", {
    name: "created_at",
    nullable: true,
    default: () => "now()",
  })
  createdAt: Date | null;

  @Column("integer", { name: "is_deleted", default: () => "0" })
  isDeleted: number;

  @Column("timestamp with time zone", {
    name: "updated_at",
    default: () => "now()",
  })
  updatedAt: Date;
}
