import { Column, Entity, Index } from "typeorm";

@Index("looksrare_v2_subset_nonce_cancel_events_pk", ["batchIndex", "logIndex", "txHash"], {
  unique: true,
})
@Index("looksrare_v2_subset_nonce_cancel_events_maker_nonce_index", ["maker", "nonce"], {})
@Entity("looksrare_v2_subset_nonce_cancel_events")
export class LooksrareV2SubsetNonceCancelEvents {
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

  @Column("bytea", { name: "maker" })
  maker: Buffer;

  @Column("numeric", { name: "nonce", precision: 78, scale: 0 })
  nonce: string;
}
