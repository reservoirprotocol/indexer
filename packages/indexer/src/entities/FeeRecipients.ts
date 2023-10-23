import { Column, Entity, Index } from "typeorm";

@Index("fee_recipients_pk", ["address", "kind"], { unique: true })
@Entity("fee_recipients")
export class FeeRecipients {
  @Column("bytea", { primary: true, name: "address" })
  address: Buffer;

  @Column("enum", {
    primary: true,
    name: "kind",
    enum: ["marketplace", "royalty"],
  })
  kind: "marketplace" | "royalty";

  @Column("integer", { name: "source_id", nullable: true })
  sourceId: number | null;
}
