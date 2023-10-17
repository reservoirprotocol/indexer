import { Column, Entity, Index } from "typeorm";

@Index("ft_transfer_events_block_block_hash_index", ["block", "blockHash"], {})
@Index("ft_transfer_events_pk", ["logIndex", "txHash"], { unique: true })
@Entity("ft_transfer_events", { schema: "public" })
export class FtTransferEvents {
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

  @Column("bytea", { name: "from" })
  from: Buffer;

  @Column("bytea", { name: "to" })
  to: Buffer;

  @Column("numeric", { name: "amount", precision: 78, scale: 0 })
  amount: string;
}
