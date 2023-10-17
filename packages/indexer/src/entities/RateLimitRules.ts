import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Index("rate_limit_rules_correlation_id_unique_index", ["correlationId"], {
  unique: true,
})
@Index("rate_limit_rules_pkey", ["id"], { unique: true })
@Entity("rate_limit_rules", { schema: "public" })
export class RateLimitRules {
  @PrimaryGeneratedColumn({ type: "integer", name: "id" })
  id: number;

  @Column("text", { name: "route" })
  route: string;

  @Column("text", { name: "method", default: () => "''" })
  method: string;

  @Column("integer", { name: "tier", nullable: true })
  tier: number | null;

  @Column("jsonb", { name: "options" })
  options: object;

  @Column("timestamp with time zone", {
    name: "created_at",
    default: () => "now()",
  })
  createdAt: Date;

  @Column("text", { name: "api_key", default: () => "''" })
  apiKey: string;

  @Column("jsonb", { name: "payload", default: [] })
  payload: object;

  @Column("uuid", {
    name: "correlation_id",
    nullable: true,
    default: () => "uuid_generate_v4()",
  })
  correlationId: string | null;
}
