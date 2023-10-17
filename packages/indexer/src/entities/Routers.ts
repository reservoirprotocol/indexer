import { Column, Entity, Index } from "typeorm";

@Index("routers_pk", ["address"], { unique: true })
@Entity("routers", { schema: "public" })
export class Routers {
  @Column("bytea", { primary: true, name: "address" })
  address: Buffer;

  @Column("integer", { name: "source_id" })
  sourceId: number;
}
