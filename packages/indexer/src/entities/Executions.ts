import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Index("executions_pk", ["id"], { unique: true })
@Entity("executions", { schema: "public" })
export class Executions {
  @PrimaryGeneratedColumn({ type: "bigint", name: "id" })
  id: string;

  @Column("uuid", { name: "request_id" })
  requestId: string;

  @Column("jsonb", { name: "request_data" })
  requestData: object;

  @Column("text", { name: "api_key", nullable: true })
  apiKey: string | null;

  @Column("enum", { name: "side", enum: ["buy", "sell", "bundle"] })
  side: "buy" | "sell" | "bundle";

  @Column("enum", { name: "action", enum: ["create", "fill"] })
  action: "create" | "fill";

  @Column("bytea", { name: "user" })
  user: Buffer;

  @Column("text", { name: "order_id" })
  orderId: string;

  @Column("integer", { name: "quantity" })
  quantity: number;

  @Column("bytea", { name: "calldata", nullable: true })
  calldata: Buffer | null;

  @Column("timestamp with time zone", {
    name: "created_at",
    default: () => "now()",
  })
  createdAt: Date;

  @Column("bytea", { name: "from", nullable: true })
  from: Buffer | null;

  @Column("bytea", { name: "to", nullable: true })
  to: Buffer | null;

  @Column("numeric", { name: "value", nullable: true, precision: 78, scale: 0 })
  value: string | null;
}
