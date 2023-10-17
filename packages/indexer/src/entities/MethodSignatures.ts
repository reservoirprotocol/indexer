import { Column, Entity, Index } from "typeorm";

@Index("method_signatures_pk", ["params", "signature"], { unique: true })
@Entity("method_signatures", { schema: "public" })
export class MethodSignatures {
  @Column("bytea", { primary: true, name: "signature" })
  signature: Buffer;

  @Column("text", { name: "name" })
  name: string;

  @Column("text", { primary: true, name: "params" })
  params: string;
}
