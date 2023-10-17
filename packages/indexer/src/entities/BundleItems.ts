import { Column, Entity, Index } from "typeorm";

@Index("bundle_items_token_set_id_bundle_id_index", ["bundleId", "tokenSetId"], {})
@Index("bundle_items_pk", ["bundleId", "tokenSetId"], { unique: true })
@Entity("bundle_items", { schema: "public" })
export class BundleItems {
  @Column("bigint", { primary: true, name: "bundle_id" })
  bundleId: string;

  @Column("enum", { name: "kind", enum: ["ft", "nft"] })
  kind: "ft" | "nft";

  @Column("text", { primary: true, name: "token_set_id" })
  tokenSetId: string;

  @Column("numeric", { name: "amount", default: () => "1" })
  amount: string;
}
