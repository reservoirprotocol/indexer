import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Index("bundles_pk", ["id"], { unique: true })
@Entity("bundles", { schema: "public" })
export class Bundles {
  @PrimaryGeneratedColumn({ type: "bigint", name: "id" })
  id: string;

  @Column("jsonb", { name: "metadata", nullable: true })
  metadata: object | null;
}
