import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Index(
  "monthly_api_usage_month_api_key_route_status_code_unique_index",
  ["apiKey", "month", "route", "statusCode"],
  { unique: true }
)
@Index("monthly_api_usage_pk", ["id"], { unique: true })
@Entity("monthly_api_usage", { schema: "public" })
export class MonthlyApiUsage {
  @Column("text", { name: "api_key" })
  apiKey: string;

  @Column("text", { name: "route" })
  route: string;

  @Column("integer", { name: "api_calls_count", default: () => "0" })
  apiCallsCount: number;

  @Column("integer", { name: "status_code" })
  statusCode: number;

  @Column("integer", { name: "points", default: () => "0" })
  points: number;

  @Column("timestamp with time zone", { name: "month" })
  month: Date;

  @PrimaryGeneratedColumn({ type: "bigint", name: "id" })
  id: string;
}
