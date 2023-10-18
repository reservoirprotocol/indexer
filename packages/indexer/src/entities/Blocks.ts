import { Column, Entity, Index } from "typeorm";

@Index("blocks_pk", ["hash", "number"], { unique: true })
@Entity("blocks")
export class Blocks {
  @Column("bytea", { primary: true, name: "hash" })
  hash: Buffer;

  @Column("integer", { primary: true, name: "number" })
  number: number;

  @Column("integer", { name: "timestamp", nullable: true })
  timestamp: number | null;
}
