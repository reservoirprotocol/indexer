import { Column, Entity, Index } from "typeorm";

@Index("api_keys_pk", ["key"], { unique: true })
@Entity("api_keys", { schema: "public" })
export class ApiKeys {
  @Column("text", { primary: true, name: "key" })
  key: string;

  @Column("text", { name: "app_name" })
  appName: string;

  @Column("text", { name: "website" })
  website: string;

  @Column("text", { name: "email" })
  email: string;

  @Column("timestamp with time zone", {
    name: "created_at",
    nullable: true,
    default: () => "now()",
  })
  createdAt: Date | null;

  @Column("boolean", { name: "active", default: () => "true" })
  active: boolean;

  @Column("integer", { name: "tier", default: () => "0" })
  tier: number;

  @Column("jsonb", { name: "permissions", nullable: true })
  permissions: object | null;

  @Column("jsonb", { name: "ips", default: [] })
  ips: object;

  @Column("jsonb", { name: "origins", default: [] })
  origins: object;
}
