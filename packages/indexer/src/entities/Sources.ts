import { Column, Entity, Index } from "typeorm";

@Index("sources_pk", ["sourceId"], { unique: true })
@Entity("sources")
export class Sources {
  @Column("text", { primary: true, name: "source_id" })
  sourceId: string;

  @Column("jsonb", { name: "metadata" })
  metadata: object;
}
