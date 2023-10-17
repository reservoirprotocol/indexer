import { Column, Entity, Index } from "typeorm";

@Index("nonce_cancel_events_pk", ["batchIndex", "logIndex", "txHash"], {
  unique: true,
})
@Index("nonce_cancel_events_block_block_hash_index", ["block", "blockHash"], {})
@Index("nonce_cancel_events_order_kind_maker_nonce_index", ["maker", "nonce", "orderKind"], {})
@Entity("nonce_cancel_events", { schema: "public" })
export class NonceCancelEvents {
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

  @Column("bytea", { name: "maker" })
  maker: Buffer;

  @Column("numeric", { name: "nonce", precision: 78, scale: 0 })
  nonce: string;
}
