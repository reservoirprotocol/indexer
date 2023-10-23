import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Index("sources_address_unique_index", ["address"], { unique: true })
@Index("sources_domain_unique_index", ["domain"], { unique: true })
@Index("sources_domain_hash_unique_index", ["domainHash"], { unique: true })
@Index("sources_v2_pkey", ["id"], { unique: true })
@Index("sources_name_unique_index", ["name"], { unique: true })
@Entity("sources_v2")
export class SourcesV2 {
  @PrimaryGeneratedColumn({ type: "integer", name: "id" })
  id: number;

  @Column("text", { name: "name" })
  name: string;

  @Column("text", { name: "address" })
  address: string;

  @Column("jsonb", { name: "metadata" })
  metadata: object;

  @Column("text", { name: "domain" })
  domain: string;

  @Column("text", { name: "domain_hash" })
  domainHash: string;

  @Column("boolean", { name: "optimized", default: () => "false" })
  optimized: boolean;

  @Column("timestamp with time zone", {
    name: "created_at",
    default: () => "now()",
  })
  createdAt: Date;
}
