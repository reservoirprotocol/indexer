import { Column, Entity, Index } from "typeorm";

@Index("allowlists_pk", ["id"], { unique: true })
@Entity("allowlists")
export class Allowlists {
  @Column("text", { primary: true, name: "id" })
  id: string;
}
