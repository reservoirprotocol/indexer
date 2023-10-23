import { Column, Entity, Index } from "typeorm";

@Index("cancel_events_block_block_hash_index", ["block", "blockHash"], {})
@Index("cancel_events_pk", ["blockHash", "logIndex", "txHash"], {
  unique: true,
})
@Index("cancel_events_order_id_timestamp_index", ["orderId", "timestamp"], {})
@Entity("cancel_events")
export class CancelEvents {
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

  @Column("enum", {
    name: "order_kind",
    enum: [
      "wyvern-v2",
      "wyvern-v2.3",
      "looks-rare",
      "opendao-erc721",
      "opendao-erc1155",
      "zeroex-v4-erc721",
      "zeroex-v4-erc1155",
      "foundation",
      "x2y2",
      "seaport",
      "rarible",
      "element-erc721",
      "element-erc1155",
      "quixotic",
      "nouns",
      "cryptopunks",
      "zora-v3",
      "mint",
      "universe",
      "sudoswap",
      "nftx",
      "blur",
      "forward",
      "manifold",
      "tofu-nft",
      "nft-trader",
      "decentraland",
      "okex",
      "bend-dao",
      "superrare",
      "infinity",
      "flow",
      "seaport-v1.2",
      "zeroex-v2",
      "seaport-v1.3",
      "seaport-v1.4",
      "treasure",
      "zeroex-v3",
      "looks-rare-v2",
      "alienswap",
      "seaport-v1.5",
      "blend",
      "collectionxyz",
      "sudoswap-v2",
      "payment-processor",
      "blur-v2",
      "caviar-v1",
      "midaswap",
      "joepeg",
    ],
  })
  orderKind:
    | "wyvern-v2"
    | "wyvern-v2.3"
    | "looks-rare"
    | "opendao-erc721"
    | "opendao-erc1155"
    | "zeroex-v4-erc721"
    | "zeroex-v4-erc1155"
    | "foundation"
    | "x2y2"
    | "seaport"
    | "rarible"
    | "element-erc721"
    | "element-erc1155"
    | "quixotic"
    | "nouns"
    | "cryptopunks"
    | "zora-v3"
    | "mint"
    | "universe"
    | "sudoswap"
    | "nftx"
    | "blur"
    | "forward"
    | "manifold"
    | "tofu-nft"
    | "nft-trader"
    | "decentraland"
    | "okex"
    | "bend-dao"
    | "superrare"
    | "infinity"
    | "flow"
    | "seaport-v1.2"
    | "zeroex-v2"
    | "seaport-v1.3"
    | "seaport-v1.4"
    | "treasure"
    | "zeroex-v3"
    | "looks-rare-v2"
    | "alienswap"
    | "seaport-v1.5"
    | "blend"
    | "collectionxyz"
    | "sudoswap-v2"
    | "payment-processor"
    | "blur-v2"
    | "caviar-v1"
    | "midaswap"
    | "joepeg";

  @Column("text", { name: "order_id" })
  orderId: string;

  @Column("timestamp with time zone", {
    name: "created_at",
    nullable: true,
    default: () => "now()",
  })
  createdAt: Date | null;
}
