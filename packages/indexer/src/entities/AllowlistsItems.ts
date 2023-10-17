import { Column, Entity, Index } from "typeorm";

@Index("allowlists_items_allowlist_id_address_index", ["address", "allowlistId"], {})
@Index("allowlists_items_pk", ["allowlistId", "index"], { unique: true })
@Entity("allowlists_items", { schema: "public" })
export class AllowlistsItems {
  @Column("text", { primary: true, name: "allowlist_id" })
  allowlistId: string;

  @Column("integer", { primary: true, name: "index" })
  index: number;

  @Column("bytea", { name: "address" })
  address: Buffer;

  @Column("numeric", {
    name: "max_mints",
    nullable: true,
    precision: 78,
    scale: 0,
  })
  maxMints: string | null;

  @Column("numeric", { name: "price", nullable: true, precision: 78, scale: 0 })
  price: string | null;

  @Column("numeric", {
    name: "actual_price",
    nullable: true,
    precision: 78,
    scale: 0,
  })
  actualPrice: string | null;
}
